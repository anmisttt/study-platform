import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PracticeQuality, type PracticeItem } from "@study-platform/shared";
import { chapters, getChapterById } from "../chapters";
import { systemPrompt } from "../prompts/system-prompt";
import { userPromptForPractice } from "../prompts/practice-user-prompt";
import { Tutor } from "../services/tutor";

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config();

type Trial = { rating: number; comment: string };

type Aggregate = {
  mean: number;
  min: number;
  max: number;
  majorityGte5: boolean;
  pass: boolean;
};

function usage(): never {
  console.error(`Usage:
  npm run grade-practice -- --list
  npm run grade-practice -- --chapter <id> --index <n> --dump-brief
  npm run grade-practice -- --chapter <id> --index <n> --answer-file <path> [--trials N]
  npm run grade-practice -- --chapter <id> --index <n> --reference [--trials N]
  npm run grade-practice -- --chapter <id> --index <n> --answer-file <path> --reference [--trials N]

Options:
  --trials N     Tutor evaluations to run (default: 3). Pass = majority of trials >= 5.
  --json         Print machine-readable JSON only.
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: {
    list?: boolean;
    chapter?: string;
    index?: number;
    answerFile?: string;
    reference?: boolean;
    dumpBrief?: boolean;
    trials: number;
    json?: boolean;
  } = { trials: 3 };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--list":
        out.list = true;
        break;
      case "--chapter":
        if (!next) usage();
        out.chapter = next;
        i++;
        break;
      case "--index":
        if (!next || Number.isNaN(Number(next))) usage();
        out.index = Number(next);
        i++;
        break;
      case "--answer-file":
        if (!next) usage();
        out.answerFile = next;
        i++;
        break;
      case "--reference":
        out.reference = true;
        break;
      case "--dump-brief":
        out.dumpBrief = true;
        break;
      case "--trials":
        if (!next || Number.isNaN(Number(next))) usage();
        out.trials = Math.max(1, Number(next));
        i++;
        break;
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        usage();
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        usage();
    }
  }
  return out;
}

function clonePracticeItem(item: PracticeItem): PracticeItem {
  return {
    task: item.task,
    description: item.description,
    solutions: item.solutions.map((s) => ({ ...s })),
  };
}

function perfectSolution(item: PracticeItem): string {
  const ranked = [...item.solutions].sort(
    (a, b) => PracticeQuality[b.quality] - PracticeQuality[a.quality],
  );
  if (!ranked[0]) throw new Error("No solutions found for practice item");
  return ranked[0].solution;
}

function aggregateTrials(trials: Trial[]): Aggregate {
  const ratings = trials.map((t) => t.rating);
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const gte5 = ratings.filter((r) => r >= 5).length;
  const majorityGte5 = gte5 > ratings.length / 2;
  return { mean, min, max, majorityGte5, pass: majorityGte5 };
}

async function runTrials(tutor: Tutor, item: PracticeItem, answer: string, trials: number): Promise<Trial[]> {
  const results: Trial[] = [];
  for (let i = 0; i < trials; i++) {
    const prompt = userPromptForPractice(answer, clonePracticeItem(item));
    const result = await tutor.evaluateAnswer(prompt);
    results.push({ rating: result.rating, comment: result.comment });
  }
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const payload = chapters.map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      practiceCount: c.practice.length,
      practice: c.practice.map((p, index) => ({ index, task: p.task })),
    }));
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (args.chapter === undefined || args.index === undefined) usage();

  const chapter = getChapterById(args.chapter);
  if (!chapter) {
    console.error(`Chapter not found: ${args.chapter}`);
    console.error(`Known ids: ${chapters.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }

  const item = chapter.practice[args.index];
  if (!item) {
    console.error(`Practice index ${args.index} out of range (0..${chapter.practice.length - 1})`);
    process.exit(1);
  }

  if (args.dumpBrief) {
    const repoRoot = path.resolve(__dirname, "../../..");
    const brief = {
      chapterId: chapter.id,
      practiceIndex: args.index,
      task: item.task,
      description: item.description,
      workdirHint: path.join(
        repoRoot,
        ".practice-validation",
        chapter.id,
        `q${args.index}`,
      ),
    };
    console.log(JSON.stringify(brief, null, 2));
    return;
  }

  if (!args.answerFile && !args.reference) usage();

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required to grade practice answers.");
    process.exit(1);
  }

  const tutor = new Tutor({
    systemPrompt,
    model: process.env.OPENAI_GRADE_MODEL ?? "gpt-5.5",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 1,
  });

  const report: {
    chapterId: string;
    practiceIndex: number;
    task: string;
    trials: number;
    blind: { answerSource: string; trials: Trial[]; aggregate: Aggregate } | null;
    reference: { trials: Trial[]; aggregate: Aggregate } | null;
    pass: boolean;
  } = {
    chapterId: chapter.id,
    practiceIndex: args.index,
    task: item.task,
    trials: args.trials,
    blind: null,
    reference: null,
    pass: true,
  };

  if (args.answerFile) {
    const answerPath = path.resolve(args.answerFile);
    const answer = fs.readFileSync(answerPath, "utf8");
    const trials = await runTrials(tutor, item, answer, args.trials);
    const agg = aggregateTrials(trials);
    report.blind = { answerSource: answerPath, trials, aggregate: agg };
    report.pass = report.pass && agg.pass;
  }

  if (args.reference) {
    const answer = perfectSolution(item);
    const trials = await runTrials(tutor, item, answer, args.trials);
    const agg = aggregateTrials(trials);
    report.reference = { trials, aggregate: agg };
    report.pass = report.pass && agg.pass;
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
    console.error(report.pass ? "PASS" : "FAIL");
  }

  process.exit(report.pass ? 0 : 2);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
