---
name: validate-practice-tasks
description: >-
  Orchestrates styleguide gate → correctness review → blind solve → tutor grade
  → repair loop for chapter practice items using practice-styleguide,
  practice-correctness, practice-solver, practice-grader, and practice-editor
  subagents. Use when validating practice tasks, checking setups/reference
  answers, improving practice JSON until tutor score 5, or when the user
  mentions practice validation / reproducibility / styleguide compliance.
---

# Validate practice tasks

Goal: each practice item matches the [practice styleguide](STYLEGUIDE.md), is technically correct (task + reference answer), is reproducible from `task` + `question` alone, and both a blind solution and the stored `answer` get tutor score 5 (majority of trials).

## Subagents

| Agent | Role |
| --- | --- |
| `practice-styleguide` | First gate: styleguide compliance; pass → correctness, fail → editor |
| `practice-correctness` | Second gate: Bugbot-style review of task + reference answer; pass → solver, fail → editor |
| `practice-solver` | Blind reproduce + solve from pasted brief only |
| `practice-grader` | Run `npm run grade-practice` and hypothesize failures |
| `practice-editor` | Minimal edits to that one practice item |

## Styleguide

Canonical rules live in [STYLEGUIDE.md](STYLEGUIDE.md). Every round starts with `practice-styleguide`. Do not skip this gate.

## CLI (from `backend/`)

Requires `OPENAI_API_KEY` (same as the server tutor).

```bash
npm run grade-practice -- --list
npm run grade-practice -- --chapter <id> --index <n> --dump-brief
npm run grade-practice -- --chapter <id> --index <n> --answer-file <path> --trials 3
npm run grade-practice -- --chapter <id> --index <n> --reference --trials 3
```

Chapter ids match `backend/src/chapters.ts` (e.g. `tenth_chapter`).

## Loop (max 5 rounds)

For each `(chapterId, practiceIndex)`:

### 0. Styleguide gate (first agent)

Delegate to **practice-styleguide** with:

- `chapterId`, `practiceIndex`
- Path to the chapter JSON under `backend/src/data/`

If `status` is `fail` (`handOff`: `practice-editor`):

- Skip correctness, solver, and grader for this round.
- Delegate to **practice-editor** with the styleguide JSON (`violations`, `feedbackForEditor`).
- Then **increment round** and return to step 0 with a fresh workdir (do not reuse old solver files).

If `status` is `pass` (`handOff`: `practice-correctness`) → continue to step 0b.

### 0b. Correctness review (second agent)

Delegate to **practice-correctness** with:

- `chapterId`, `practiceIndex`
- Path to the chapter JSON under `backend/src/data/`

Launch exactly one `practice-correctness` subagent per round after a styleguide pass (`run_in_background: false` unless the user asks otherwise). Use this prompt shape:

```text
chapterId: <id>
practiceIndex: <n>
chapterFile: <absolute path to backend/src/data/..._chapter.json>
```

If `status` is `fail` (`handOff`: `practice-editor`):

- Skip solver and grader for this round.
- Delegate to **practice-editor** with the correctness JSON (`findings`, `feedbackForEditor`).
- Then **increment round** and return to step 0 with a fresh workdir.

If `status` is `pass` (`handOff`: `practice-solver`) → continue to step 1.

After the subagent finishes, keep a compact note in the round report: pass/fail and, on fail, a short table of error findings (`severity`, `location`, `finding`) sorted with `error` first — same spirit as a Bugbot summary. Do not fix findings yourself; the editor owns edits.

### 1. Prepare isolation

```bash
npm run grade-practice -- --chapter <id> --index <n> --dump-brief
```

Create workdir from `workdirHint` (under `.practice-validation/`, gitignored). Write `brief.json` there with **only** `task` and `question`.

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
# If the task used Docker etcd:
docker ps -a --filter name=etcd-dev --format '{{.Names}}'   # expect empty
```

Also scan the repo root (and the solver's reported cwd, if different) for other unexpected dirs/files created by the run (WAL/snap stores, orphaned containers, leftover background etcd processes).

- If leftovers exist: remove them now, treat as a solver process failure in the round report (`cleanup` incomplete), and tell the next solver round explicitly that cleanup is mandatory. Do **not** leave `etcd-data/` (or similar) in the repo.
- Confirm solver JSON has `cleanup.done: true` and empty `leftRunning`. If missing or false, same treatment as leftovers.
- Workdir contents under `.practice-validation/` are expected and are not leftovers.

### 3. Grader

Delegate to **practice-grader** to run both:

- `--answer-file` on `answer.md`
- `--reference`

Pass when CLI `pass` is true for both. On pass → stop success.

On fail → use grader `hypothesis` + `feedbackForEditor`.

### 4. Editor

Delegate to **practice-editor** with solver/grader and/or styleguide/correctness JSON and the chapter file path. Then **increment round** and return to step 0 with a **fresh** workdir (do not reuse solver files that saw old wording).

### 5. Stop

After 5 failed rounds, stop and report remaining issues for human review. Do not keep editing.

## Isolation rules (parent must enforce)

- Never let practice-solver read `backend/src/data/*.json` or answer text.
- Never put tutor comments or reference answers into the solver prompt.
- practice-styleguide and practice-correctness may read the target practice item (including `answer`) and the styleguide; they must not edit.
- practice-editor may read/write only the target practice item.
- After each solver turn, run the artifact check (step 2b). Repo-root leftovers like `etcd-data/` must be deleted before the next round or final report.

## Success criteria

1. Styleguide gate passed on the final item (`practice-styleguide` status `pass`).
2. Correctness gate passed on the final item (`practice-correctness` status `pass`, no `error` findings).
3. Blind agent answer: majority of `--trials` ratings ≥ 5.
4. Stored reference `answer`: majority of `--trials` ratings ≥ 5.
5. Solver did not need steps absent from the question.
6. No leftover runtime artifacts outside the workdir (e.g. no `etcd-data/` at repo root, no leftover `etcd-dev` container).
