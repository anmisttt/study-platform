import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { createHash, type Hash } from "node:crypto";
import { getChapterById } from "../chapters.js";

// Chapter data and setup assets come from the checkout this script lives in, so
// hashes describe the version actually being validated.
const workspaceRoot = path.join(import.meta.dirname, "../../..");

// The log itself belongs to the main checkout, shared by every worktree: a
// worktree-local log would split the history and vanish with the worktree.
function resolveLogRoot(): string {
  try {
    const gitCommonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: workspaceRoot, encoding: "utf8" },
    ).trim();
    return path.dirname(gitCommonDir);
  } catch {
    return workspaceRoot;
  }
}

const defaultLogPath = path.join(resolveLogRoot(), ".practice-validation", "rounds.jsonl");
const logPath = process.env.PRACTICE_ROUND_LOG ?? defaultLogPath;

const gates = ["styleguide", "correctness", "solver", "grader", "promote"] as const;
const statuses = ["pass", "fail", "blocked", "setup_failed"] as const;

type Gate = (typeof gates)[number];
type Status = (typeof statuses)[number];

type RoundRecord = {
  ts: string;
  chapter: string;
  index: number;
  labTag: string;
  contentHash: string;
  round: number;
  gate: Gate;
  status: Status;
  violations?: string[];
  score?: number;
  trials?: number;
  note?: string;
};

function usage(): never {
  console.error(`Usage:
  npm run log-validation-round -- --chapter <id> --index <n> --round <r> --gate <gate> --status <status> [options]
  npm run log-validation-round -- --report [--chapter <id>] [--json]

Gates:    ${gates.join(" | ")}
Statuses: ${statuses.join(" | ")}

Options:
  --violations a,b   Violation or finding ids reported by the failing gate.
  --score N          Tutor rating from the grader run.
  --trials N         Trials the grader used.
  --note "..."       One short line of context.
  --json             Print machine-readable JSON only.

Each line is appended to .practice-validation/rounds.jsonl and stamped with a
content hash of task + question + setup assets, so edits start a new series
instead of mixing with rounds that scored the old wording.
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: {
    chapter?: string;
    index?: number;
    round?: number;
    gate?: Gate;
    status?: Status;
    violations?: string[];
    score?: number;
    trials?: number;
    note?: string;
    report?: boolean;
    json?: boolean;
  } = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
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
      case "--round":
        if (!next || Number.isNaN(Number(next))) usage();
        out.round = Number(next);
        i++;
        break;
      case "--gate":
        if (!next || !gates.includes(next as Gate)) usage();
        out.gate = next as Gate;
        i++;
        break;
      case "--status":
        if (!next || !statuses.includes(next as Status)) usage();
        out.status = next as Status;
        i++;
        break;
      case "--violations":
        if (!next) usage();
        out.violations = next
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        i++;
        break;
      case "--score":
        if (!next || Number.isNaN(Number(next))) usage();
        out.score = Number(next);
        i++;
        break;
      case "--trials":
        if (!next || Number.isNaN(Number(next))) usage();
        out.trials = Number(next);
        i++;
        break;
      case "--note":
        if (!next) usage();
        out.note = next;
        i++;
        break;
      case "--report":
        out.report = true;
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

function hashDirectory(dir: string, hash: Hash): void {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    hash.update(entry.name);
    if (entry.isDirectory()) {
      hashDirectory(entryPath, hash);
    } else {
      hash.update(fs.readFileSync(entryPath));
    }
  }
}

function describeItem(chapterId: string, index: number) {
  const chapter = getChapterById(chapterId);
  if (!chapter) {
    console.error(`Unknown chapter: ${chapterId}`);
    process.exit(1);
  }

  const item = chapter.practice?.[index];
  if (!item) {
    console.error(
      `Chapter ${chapterId} has no practice item at index ${index} (practice length: ${chapter.practice?.length ?? 0}).`,
    );
    process.exit(1);
  }

  const labTag = `ch${chapter.number}-p${index + 1}`;
  const setupPath = path.join(workspaceRoot, "practice-setups", "tasks", labTag);
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ task: item.task, question: item.question }));
  if (fs.existsSync(setupPath)) {
    hashDirectory(setupPath, hash);
  }

  return { labTag, contentHash: hash.digest("hex").slice(0, 12) };
}

function append(args: ReturnType<typeof parseArgs>): void {
  const { chapter, index, round, gate, status } = args;
  if (!chapter || index === undefined || round === undefined || !gate || !status) usage();

  const { labTag, contentHash } = describeItem(chapter, index);
  const record: RoundRecord = {
    ts: new Date().toISOString(),
    chapter,
    index,
    labTag,
    contentHash,
    round,
    gate,
    status,
    ...(args.violations?.length ? { violations: args.violations } : {}),
    ...(args.score === undefined ? {} : { score: args.score }),
    ...(args.trials === undefined ? {} : { trials: args.trials }),
    ...(args.note ? { note: args.note } : {}),
  };

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);

  if (args.json) {
    console.log(JSON.stringify(record));
  } else {
    console.log(
      `logged ${labTag} ${contentHash} round ${round} ${gate}=${status}${
        args.score === undefined ? "" : ` score=${args.score}`
      }`,
    );
  }
}

function readLog(): RoundRecord[] {
  if (!fs.existsSync(logPath)) {
    console.error(`No round log yet at ${logPath}`);
    process.exit(1);
  }

  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as RoundRecord);
}

type Series = {
  chapter: string;
  index: number;
  labTag: string;
  contentHash: string;
  current: boolean;
  rounds: number;
  passed: boolean;
  score?: number;
  failedGates: Partial<Record<Gate, number>>;
  violations: Record<string, number>;
};

function buildSeries(records: RoundRecord[]): Series[] {
  const byKey = new Map<string, Series>();
  const currentHashes = new Map<string, string>();

  for (const record of records) {
    const itemKey = `${record.chapter}#${record.index}`;
    if (!currentHashes.has(itemKey)) {
      currentHashes.set(itemKey, describeItem(record.chapter, record.index).contentHash);
    }

    const key = `${itemKey}@${record.contentHash}`;
    const series =
      byKey.get(key) ??
      ({
        chapter: record.chapter,
        index: record.index,
        labTag: record.labTag,
        contentHash: record.contentHash,
        current: currentHashes.get(itemKey) === record.contentHash,
        rounds: 0,
        passed: false,
        failedGates: {},
        violations: {},
      } satisfies Series);

    series.rounds = Math.max(series.rounds, record.round);
    if (record.gate === "promote" || (record.gate === "grader" && record.status === "pass")) {
      series.passed = true;
    }
    if (record.status !== "pass" && record.gate !== "promote") {
      series.failedGates[record.gate] = (series.failedGates[record.gate] ?? 0) + 1;
    }
    for (const violation of record.violations ?? []) {
      series.violations[violation] = (series.violations[violation] ?? 0) + 1;
    }
    if (record.score !== undefined) {
      series.score = record.score;
    }

    byKey.set(key, series);
  }

  return [...byKey.values()].sort(
    (a, b) => a.chapter.localeCompare(b.chapter) || a.index - b.index,
  );
}

function report(args: ReturnType<typeof parseArgs>): void {
  const records = readLog().filter((record) => !args.chapter || record.chapter === args.chapter);
  const series = buildSeries(records);

  if (args.json) {
    console.log(JSON.stringify(series, null, 2));
    return;
  }

  console.log(`${records.length} rounds across ${series.length} task versions\n`);
  for (const entry of series) {
    const gates = Object.entries(entry.failedGates)
      .sort((a, b) => b[1] - a[1])
      .map(([gate, count]) => `${gate}x${count}`)
      .join(" ");
    console.log(
      [
        entry.labTag.padEnd(9),
        entry.contentHash,
        entry.current ? "current" : "stale  ",
        `rounds=${entry.rounds}`,
        entry.passed ? "passed" : "open  ",
        entry.score === undefined ? "" : `score=${entry.score}`,
        gates,
      ]
        .filter(Boolean)
        .join("  "),
    );
  }

  const violations: Record<string, number> = {};
  for (const entry of series) {
    if (!entry.current) continue;
    for (const [violation, count] of Object.entries(entry.violations)) {
      violations[violation] = (violations[violation] ?? 0) + count;
    }
  }

  const ranked = Object.entries(violations).sort((a, b) => b[1] - a[1]);
  if (ranked.length) {
    console.log("\nTop violations (current versions only):");
    for (const [violation, count] of ranked.slice(0, 10)) {
      console.log(`  ${String(count).padStart(3)}  ${violation}`);
    }
  }

  const passed = series.filter((entry) => entry.current && entry.passed);
  if (passed.length) {
    const mean = passed.reduce((sum, entry) => sum + entry.rounds, 0) / passed.length;
    console.log(`\nMean rounds-to-pass (current versions): ${mean.toFixed(1)}`);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.report) {
  report(args);
} else {
  append(args);
}
