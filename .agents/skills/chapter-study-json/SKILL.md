---
name: chapter-study-json
description: Generate self-contained chapter study JSON (theory + practice) from Designing Data-Intensive Applications or similar technical books. Use when the user asks to create study material for a chapter, generate a chapter JSON, do the same for chapter N, or produce first_chapter.json / second_chapter.json style files.
---

# Chapter Study JSON Generator

Create study material JSON for one book chapter. Follow these instructions exactly. Match tone and density of existing `*_chapter.json` files in the repo root.

## Workflow

1. Identify the book file and target chapter (e.g. `do the same for chapter 2`).
2. Read **only** the requested chapter from the book. If page extraction looks malformed, re-check page order before writing output; external official documentation for real-world tool/workflow verification is still required by step 3.
3. Before drafting each practice item, establish how practitioners perform that work in real systems. Use current official documentation or another primary source to identify the actual product, native CLI/API, configuration and data artifacts, command sequence, and observable results.
4. Draft ~10–15 theory items and 1–5 practice briefs (unless the user asks otherwise), using the verified real-world tools and workflow. Do not draft solutions for practice items.
5. For every Docker-backed practice item, ensure the matching assets under `practice-setups/tasks/chN-pI/` package those same tools and artifacts. Follow [the setup maintainer workflow](../../../practice-setups/README.md); do not modify unrelated task setups.
6. Save as `<chapter_name>.json` or the filename the user requested (repo convention: `first_chapter.json`, `ninth_chapter.json`, …).
7. Validate that the JSON parses and run lints/diagnostics on the file when available.

## Output structure

Valid JSON with chapter `number`, exact chapter title in `name`, plus `theory` and `practice`:

```json
{
  "number": 1,
  "name": "name of the chapter",
  "theory": [
    {
      "question": "Short practice task, no question mark.",
      "answer": "Headline answer in 1-3 sentences — the first thing you'd say when summarizing the topic.\n\n\"Short author quote.\"\n\nDeep dive with enough context to answer without reopening the book.\n\nComment: brief real-world note or proof link."
    }
  ],
  "practice": [{
    "task": "[PostgreSQL] Learn how to work with a concrete database concept.",
    "question": "Requirements, task-relevant starter code, and expected results without completed solution logic.",
    "answer": ""
  }]
}
```

Leave each new practice `answer` empty. The practice-validation workflow fills it
with the most recently tutor-accepted blind solution; chapter creation must not
invent a separate reference solution.

## Theory questions

- Open-ended but concrete; prefer day-to-day software engineering over abstract, philosophical, or historical questions.
- Avoid vague academic jargon in the question. Lead with a concrete scenario, then optionally name the term. Prefer "You have a User object with nested job and education lists; what problems appear when storing it in relational tables?" over "Explain object-relational impedance mismatch."
- Put concrete examples in the question when choosing a model, tradeoff, database, or query style.
- Write questions as short practice tasks, not full sentences when possible.
- Never reference book structure: no `this chapter`, `the chapter`, `Chapter N`, `as discussed in Chapter N`.
- Self-contained for readers who have not read the book: define terms, scenarios, and enough context without the source.
- Outside direct author quotes, do not write `from the book`, `in the book`, or `the book says` — use plain technical explanation.
- Group related topics into one item. Convert theory into practice when doing something concrete teaches better (queries, migrations, modeling, tradeoffs).
- Aim for ~10–15 focused theory items unless asked otherwise.

## Answers

- Audience: software engineer preparing for SWE / system-design interviews. Write like a senior engineer explaining to a peer — neutral, technical, depth-first. Do not pepper answers with "interview" or "interviewer".
- Every answer must include at least one short author/book quote. Each `answer` is a string.
- Structure: headline (1–3 sentences) → quote → deep dive → optional `Comment:`.
- Usually 150–400 words; longer when covering several sub-concepts.
- Use `\n\n` between sections; use `\n` inside sections where it helps (label, data shape, query, conclusion).
- Comparisons: define the difference before pros/cons/examples. If the question lists examples, analyze each and name the recommended choice.
- No coaching phrases ("what an interviewer wants", "don't sound naive", "show you've shipped this").
- Optional `Comment:` with a real-world tie-in and proof/source link when adding external knowledge.

## Practice block

- Include when the chapter supports a concrete architecture or design exercise.
- Prefer original scenarios unless the user asks to stay close to the book.
- Choose the database or tool from the verified real-world workflow; GUI convenience is secondary. When it does not distort the workflow, prefer tools accessible through common clients such as DBeaver.
- Use the tool and workflow practitioners actually use for the learning goal: the real database, broker, migration utility, query client, configuration format, and operational sequence. Do not replace an available Docker-runnable tool with a custom simulator, mock, or hand-written approximation.
- Keep labs laptop-friendly by reducing data volume, service count, and runtime—not by changing the essential tool or workflow. Task commands, starter files, and container assets must all use the same verified instrument.
- Start every `task` with a concrete technology label in square brackets, then state the main purpose concisely in learner-oriented language. When several technologies are used, list them inside the brackets separated by a comma and one space, for example `[Kafka, PostgreSQL]`; do not join them with `+`, `/`, or `vs`. Prefer `[RDFLib, SPARQL] Learn how to work with triple stores.` over an implementation-focused title such as `[RDFLib, SPARQL] Query package dependencies as subject-predicate-object triples.` Do not use Markdown emphasis, numbering, or setup details in the title.
- Task-relevant starter code is allowed in the student-facing description. Keep it incomplete and use short edit-site markers such as `-- implement: ...` or `# TODO: ...`; never include completed solution logic, near-complete pseudocode, or solver-solution fragments.
- Express every required work item as a numbered task (`1.`, `2.`, `3.`, …). Never use `Part A`, `Part B`, lettered sections, or references to them; use `Task 1`, `Task 2`, and so on.
- Keep code comments terse: they identify edit locations or features only. Put detailed requirements, algorithms, constraints, expected results, and verification instructions after the relevant code block in the numbered task list; do not duplicate or split those instructions between comments and prose.
- Code fences in a practice description may contain operational lab commands or task-relevant starter code. Do not create complete implementation code while authoring the item; the accepted blind solution is stored later by practice validation.
- Aim for ~1–5 practice items unless asked otherwise.
- Follow [styleguide](../validate-practice-tasks/STYLEGUIDE.md)
- For Docker-backed labs, provision non-task schema and seed data during container initialization. If schema or data changes are part of the exercise, starter SQL may contain terse edit markers; the numbered tasks specify the required objects, constraints, operations, and result.
- Docker-backed labs: every client CLI in the brief (`psql`, `clickhouse-client`, `mysql`, …) must run via the container — never as a bare host command.
  - Compose: `docker compose exec -T <service> clickhouse-client --multiquery < setup.sql` (not `clickhouse-client --multiquery < setup.sql`).
  - Single container: `docker exec -i lab-chN-pI psql … < setup.sql`.
  - Interactive sessions use `docker compose exec <service> …` or `docker exec -it …` without implying the binary is on the host PATH.

## Practice verification tests

- When the implementation has concrete observable behavior, provide a compact test that checks the practice requirements. Plain language-native assertions are enough; do not add a test framework, service, abstraction layer, or dependency unless the task already needs it.
- For Docker-backed practices, deliver the test with the matching setup image/scaffold and run it through the task's container in a numbered step. For practices without a Docker setup, include the compact test or assertion snippet directly in `question` with the command that runs it.
- Test outcomes rather than exact implementation shape. Cover only the essential learning goal and a small number of useful failure cases; keep setup and runtime complexity flat.
- Keep the student-facing verification instruction short, normally `Run the tests:` followed by the command. Do not repeat the assertions or expected results in prose when the supplied test already checks them; keep only requirements the learner needs in order to implement the task.
- Add comments inside tests only when the purpose or timing of a check is not clear from its name and assertion. Do not narrate obvious test mechanics or restate assertions as comments.
- Skip an automated test when the task is purely explanatory, observational, or design-oriented and no meaningful behavior can be asserted.

## Docker-backed practice layout

Apply all of these conventions to Docker-backed practice questions:

1. Start with prerequisites and a short description of the lab.
2. Write `Setup:` as plain text, followed by one `bash` block containing only initialization and startup commands.
3. Put optional inspection and reference material in a collapsed cut using `:::cut <title>` and `:::`. Use a descriptive title such as `Observe the current state`.
4. When the scaffold creates files, run `ls -l` inside the observation block and list the expected filenames as prose after that block.
5. Keep detailed schemas, seed data, starter code, and current-state explanations inside the cut.
6. Close the cut before `Tasks:` so the numbered work remains visible outside it.
7. Express every required action as a numbered task.
8. Put operational Docker commands beside the numbered task that uses them, not in the initial setup block.
9. Indent fenced blocks and continuation text inside a numbered task by three spaces so the UI renders them at `.formatted-text__numbered-body` width.
10. Make teardown the final numbered task. Keep a short teardown command inline, for example: ``5. Tear down the Docker stack with `docker compose down -v`.``

## General rules

- Write for readers who may not have read the book. Every question and answer
  must stand alone: explain the scenario, data flow,
  and technical reasoning directly instead of pointing to book chapters, page numbers,
  or figures.
- Don't include images or references to book structure (the user doesn't see
  them). This includes figure numbers — never write `Figure 6-11`, `see Figure 3`,
  `Chapter 9`, `as discussed in Chapter 3`, or similar. Explain the idea in words
  instead: describe the scenario, data flow, or before/after state so the reader can
  follow without opening the book.
- Author quotes are fine and encouraged, but surround them with enough explanation
  that the quote is understandable on its own.
- Wrap coding blocks into ```\n{content}\n```.

## Validation checklist

- [ ] JSON parses
- [ ] `number` and exact `name` set
- [ ] Theory answers include a quote and are roughly 150–400 words when applicable
- [ ] No book-structure / figure references
- [ ] Every practice title begins with a concrete `[Technology]` label; multiple technologies use `[Technology, Technology]`; the remainder states the main learning purpose rather than implementation mechanics
- [ ] Real-world workflow and tool choice were verified against current official or primary documentation before drafting
- [ ] Task, starter scaffold, and container setup use the same authentic tool, native interface, and artifacts
- [ ] Every new practice `answer` is empty pending an accepted blind solution from practice validation
- [ ] Docker-backed briefs keep infrastructure-only schema creation and seed inserts in container initialization
- [ ] Starter code contains only incomplete scaffolding and terse implement/TODO markers, never solution fragments
- [ ] Detailed instructions appear in numbered tasks after code blocks and are not duplicated inside comments
- [ ] Practice work is organized as numbered tasks with no `Part A` / `Part B` labels
- [ ] When behavior is testable, a compact outcome-focused test is delivered by the Docker scaffold or included directly in the non-Docker brief, with a short run instruction that does not repeat its assertions; test comments exist only for non-obvious intent or timing
- [ ] Lints/diagnostics clean when available
