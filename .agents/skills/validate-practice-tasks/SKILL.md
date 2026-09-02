---
name: validate-practice-tasks
description: >-
  Orchestrates styleguide gate → correctness review → blind solve → tutor grade
  → repair loop for chapter practice items using practice-styleguide,
  practice-correctness, practice-solver, practice-grader, and practice-editor
  subagents. Use when validating practice tasks, checking setups and briefs,
  improving practice JSON until tutor score 5, or when the user
  mentions practice validation / reproducibility / styleguide compliance.
---

# Validate practice tasks

Goal: each practice item matches the [practice styleguide](STYLEGUIDE.md), has a technically sound task and setup, is reproducible from `task` + `question` alone, and yields a blind solution that gets tutor score 5 (majority of trials). The most recently accepted blind solution becomes the stored `answer` that the app displays as the practice reference.

## Subagents

| Agent | Role |
| --- | --- |
| `practice-styleguide` | First gate: styleguide compliance; pass → correctness, fail → editor |
| `practice-correctness` | Second gate: Bugbot-style review of task + setup; pass → solver, fail → editor |
| `practice-solver` | Blind reproduce + solve from pasted brief only |
| `practice-grader` | Run `npm run grade-practice` and hypothesize failures |
| `practice-editor` | Minimal edits to that one practice item |

## Styleguide

Canonical rules live in [STYLEGUIDE.md](STYLEGUIDE.md). Every round starts with `practice-styleguide`. Do not skip this gate.

## Docker-backed practice layout

Require all of these conventions when validating or repairing Docker-backed practice questions:

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

## Practice verification tests

- When a practice implementation has concrete observable behavior, require a compact test of the essential requirements. Plain assertions are sufficient; do not introduce a framework, service, dependency, or helper architecture solely for the test.
- Docker-backed practices must deliver the test in the matching setup image/scaffold and invoke it through the container from a numbered task. Practices without a Docker setup must include the compact test or assertion snippet and its run command directly in `question`.
- Tests must check outcomes without prescribing an exact implementation, remain small enough to understand at a glance, and avoid expanding the setup. Pure explanation, observation, and design exercises may omit tests when there is no meaningful behavior to assert.
- Keep verification prose to a short instruction such as `Run the tests:` plus the command. Remove enumerated expectations already enforced by the test, while preserving requirements needed to implement the exercise.
- Test comments are allowed only when a check's intent or timing is not evident from its name and assertion. Remove comments that merely narrate mechanics or repeat the assertion.

## CLI (from `backend/`)

Requires `OPENAI_API_KEY` (same as the server tutor).

```bash
npm run grade-practice -- --list
npm run grade-practice -- --chapter <id> --index <n> --dump-brief
npm run grade-practice -- --chapter <id> --index <n> --answer-file <path> --trials 3
```

Chapter ids match `backend/src/chapters.ts` (e.g. `tenth_chapter`).

## Loop (max 5 rounds)

For each `(chapterId, practiceIndex)`:

### 0. Styleguide gate (first agent)

Delegate to **practice-styleguide** with:

- `chapterId`, `practiceIndex`
- Path to the chapter JSON under `backend/src/data/`
- Matching setup path under `practice-setups/tasks/chN-pI/` when it exists

If `status` is `fail` (`handOff`: `practice-editor`):

- Skip correctness, solver, and grader for this round.
- Delegate to **practice-editor** with the styleguide JSON (`violations`, `feedbackForEditor`) and the matching setup path.
- Then **increment round** and return to step 0 with a fresh workdir (do not reuse old solver files).

If `status` is `pass` (`handOff`: `practice-correctness`) → continue to step 0b.

### 0b. Correctness review (second agent)

Delegate to **practice-correctness** with:

- `chapterId`, `practiceIndex`
- Path to the chapter JSON under `backend/src/data/`
- Matching setup path under `practice-setups/tasks/chN-pI/` when it exists

Launch exactly one `practice-correctness` subagent per round after a styleguide pass (`run_in_background: false` unless the user asks otherwise). Use this prompt shape:

```text
chapterId: <id>
practiceIndex: <n>
chapterFile: <absolute path to backend/src/data/..._chapter.json>
setupPath: <absolute path to practice-setups/tasks/chN-pI, or "none">
```

If `status` is `fail` (`handOff`: `practice-editor`):

- Skip solver and grader for this round.
- Delegate to **practice-editor** with the correctness JSON (`findings`, `feedbackForEditor`) and the matching setup path.
- Then **increment round** and return to step 0 with a fresh workdir.

If `status` is `pass` (`handOff`: `practice-solver`) → continue to step 1.

After the subagent finishes, keep a compact note in the round report: pass/fail and, on fail, a short table of error findings (`severity`, `location`, `finding`) sorted with `error` first — same spirit as a Bugbot summary. Do not fix findings yourself; the editor owns edits.

### 1. Prepare isolation

```bash
npm run grade-practice -- --chapter <id> --index <n> --dump-brief
```

Create workdir from `workdirHint` (under `.practice-validation/`, gitignored). Write `brief.json` there with **only** `task` and `question`.

If the brief references `ghcr.io/anmisttt/ddia-practice:`, build the tag locally first so the solver can run the brief verbatim (Docker prefers the local image when present):

```bash
cd practice-setups && ./build.sh <tag>   # e.g. ch1-p0
```

For compose-stack tasks, run `init` and `docker compose up -d` in the workdir after the solver copies scaffold files.

### 2. Solver

Delegate to **practice-solver** with:

- Absolute workdir
- Pasted `task` + `question` only (no `answer`, no chapter path, no prior repair notes)

If `status` is `setup_failed` or `blocked` → skip grader; go to editor with solver JSON (still run the artifact check below).

If `solved` → write `proposedSolution` to `answer.md` in the workdir.

### 2b. Artifact check (parent must enforce)

After every solver turn — pass or fail — verify the solver left **no runtime artifacts** outside the workdir:

```bash
# From the repo root
test ! -e etcd-data && test ! -e default.etcd
# Lab containers from docker-backed briefs:
docker ps -a --filter name=lab-ch --format '{{.Names}}'   # expect empty
# If the task used Docker etcd:
docker ps -a --filter name=etcd-dev --format '{{.Names}}'   # expect empty
# Compose projects started from scaffold:
docker compose ls -a   # expect no leftover lab stacks
```

Also scan the repo root (and the solver's reported cwd, if different) for other unexpected dirs/files created by the run (WAL/snap stores, orphaned containers, leftover background etcd processes).

- If leftovers exist: remove them now, treat as a solver process failure in the round report (`cleanup` incomplete), and tell the next solver round explicitly that cleanup is mandatory. Do **not** leave `etcd-data/` (or similar) in the repo.
- Confirm solver JSON has `cleanup.done: true` and empty `leftRunning`. If missing or false, same treatment as leftovers.
- Workdir contents under `.practice-validation/` are expected and are not leftovers.

### 3. Grader

Delegate to **practice-grader** to run `--answer-file` on `answer.md`.

Pass when CLI `pass` is true. The grader must not read or score the stored
`answer`. On pass → continue to step 3b.

On fail → use grader `hypothesis` + `feedbackForEditor`.

### 3b. Promote the accepted solution

After a passing grade, replace only the target practice item's `answer` with the
exact contents of `answer.md`. This promotion is the only point in the workflow
that writes `answer`; do not independently generate, repair, review, or re-grade
it. If the workflow accepts more than one candidate before it stops, the most
recently accepted candidate is the stored answer.

Validate that the chapter JSON still parses, then stop success. Do not change
`task`, `question`, theory items, or any other practice item during promotion.

### 4. Editor

Delegate to **practice-editor** with solver/grader and/or styleguide/correctness JSON, the chapter file path, and the matching setup path. Then **increment round** and return to step 0 with a **fresh** workdir (do not reuse solver files that saw old wording).

### 5. Stop

After 5 failed rounds, stop and report remaining issues for human review. Do not keep editing.

## Isolation rules (parent must enforce)

- Never let practice-solver read `backend/src/data/*.json` or answer text.
- Never put tutor comments or the stored `answer` into the solver prompt.
- practice-styleguide and practice-correctness may read only the target `task` and `question`, the styleguide, the matching `practice-setups/tasks/chN-pI/` assets, and official/primary documentation needed to verify the real-world workflow; they must not read or evaluate `answer`, and they must not edit.
- practice-editor may read the target practice item's `task` and `question` plus matching setup assets needed to understand the test contract. It may write only `task`, `question`, and compact verification-test assets; it must not read or edit `answer` or modify unrelated scaffold files.
- After each solver turn, run the artifact check (step 2b). Repo-root leftovers like `etcd-data/` must be deleted before the next round or final report.

## Success criteria

1. Styleguide gate passed on the final item (`practice-styleguide` status `pass`).
2. Correctness gate passed on the final item (`practice-correctness` status `pass`, no `error` findings).
3. Blind agent answer: majority of `--trials` ratings ≥ 5.
4. Solver did not need steps absent from the question.
5. Task, brief, starter scaffold, and container setup use the same verified real-world tool, native workflow, and versioned interfaces rather than a toy substitute.
6. The exact most recently accepted blind solution is stored in `answer` without a second grading pass.
7. No leftover runtime artifacts outside the workdir (e.g. no `etcd-data/` at repo root, no leftover `etcd-dev` container).
8. When the task has testable behavior, its compact verification test is delivered in the Docker scaffold or inline for a non-Docker task, runs through a short documented command without duplicated expectation prose, checks the essential outcomes without extra setup complexity, and comments only on non-obvious intent or timing.
