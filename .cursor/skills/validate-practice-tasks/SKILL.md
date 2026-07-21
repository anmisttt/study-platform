---
name: validate-practice-tasks
description: >-
  Orchestrates a blind solve → tutor grade → repair loop for chapter practice
  items using practice-solver, practice-grader, and practice-editor subagents.
  Use when validating practice tasks, checking setups/reference answers,
  improving practice JSON until tutor score 5, or when the user mentions
  practice validation / reproducibility.
---

# Validate practice tasks

Goal: each practice item is reproducible from `task` + `question` alone, and both a blind solution and the stored `answer` get tutor score 5 (majority of trials).

## Subagents

| Agent | Role |
| --- | --- |
| `practice-solver` | Blind reproduce + solve from pasted brief only |
| `practice-grader` | Run `npm run grade-practice` and hypothesize failures |
| `practice-editor` | Minimal edits to that one practice item |

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

Delegate to **practice-editor** with solver/grader JSON and the chapter file path. Then **increment round** and return to step 1 with a **fresh** workdir (do not reuse solver files that saw old wording).

### 5. Stop

After 5 failed rounds, stop and report remaining issues for human review. Do not keep editing.

## Isolation rules (parent must enforce)

- Never let practice-solver read `backend/src/data/*.json` or answer text.
- Never put tutor comments or reference answers into the solver prompt.
- practice-editor may read/write only the target practice item.
- After each solver turn, run the artifact check (step 2b). Repo-root leftovers like `etcd-data/` must be deleted before the next round or final report.

## Success criteria

1. Blind agent answer: majority of `--trials` ratings ≥ 5.
2. Stored reference `answer`: majority of `--trials` ratings ≥ 5.
3. Solver did not need steps absent from the question.
4. No leftover runtime artifacts outside the workdir (e.g. no `etcd-data/` at repo root, no leftover `etcd-dev` container).
