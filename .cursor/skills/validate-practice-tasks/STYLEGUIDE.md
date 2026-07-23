# Practice task styleguide

Canonical format for every `practice[]` item in `backend/src/data/*_chapter.json`.
Fields: `task` (short title), `question` (student-facing brief), `answer` (perfect reference).

## 1. Practical and reproducible

- The item is a hands-on exercise a student can run locally, not a free-form essay.
- Steps are concrete and reproducible from `task` + `question` alone (filenames, commands, expected signals).
- A careful student should not need unspoken tools, ports, env vars, or side knowledge.

## 2. Fenced code blocks

- Every code or shell snippet in `question` and `answer` must be wrapped in triple-backtick fences (```).
- Prefer a language tag when helpful (`python`, `bash`, `sql`, …).
- Do not leave multi-line code as indented plain text outside fences.

## 3. Numbered task steps

- Student work items in `question` must be numbered: `1.`, `2.`, `3.`, …
- Prefer a short lead-in such as `Tasks:` then the numbered list.
- Do not use only bullets or unnumbered paragraphs for the required work.

## 4. No markdown decoration outside code fences

- In `task`, `question`, and `answer`, do **not** use markdown headings or other structural markdown outside fenced code.
  - Forbidden outside fences: `#` / `##` / … headings, `**bold**`, `*italic*` emphasis used as decoration, `>` blockquotes, `|` tables, horizontal rules.
- Allowed outside fences: plain prose, numbered/bulleted lists, inline `` `backticks` `` for short identifiers/commands.
- Inside fenced code, language-native `#` comments and other syntax are fine.

## 5. Answer is the full setup plus required changes

- `answer` must include the complete runnable artifact(s) derived from the initial setup, with every change the tasks require already applied.
- Do not ship only a diff, a fragment, or “add these lines” patches unless the question explicitly asks for a patch format.
- Keep any short write-up as plain prose (no `#` headings); put all code in fences.

## 6. Initial setup with feature comments

- `question` must include an initial setup (files and/or commands) the student can save and run.
- Setup must be runnable as given: after following prerequisites and saving/running the setup literally, it should execute without invented fixes (syntax-complete, stated entrypoint/commands work, and any intentional bug is a deliberate runtime/logic demo — not a broken paste).
- Put **inline hints at the exact sites** the student must change — short comments on the stub, empty body, or buggy line (e.g. `# implement quorum read`, `# TODO: elect leader then CAS put`). Do not rely only on the numbered task list to say *where* to edit.
- Prefer stubs or clear markers over a fully solved setup. A stub may `raise NotImplementedError` (or equivalent) so the file still parses; any “run the setup / reproduce the bug” step must either use already-working demo code or come *after* the implement step that completes it.
- Filename(s) for the setup should be stated explicitly when the student creates files.

Example pattern (hints live in the setup, details stay in numbered tasks):

```
class LeaderlessStore:
    def quorum_read(self, idxs: List[int]) -> int:
        # implement quorum read (max of replica values at idxs)
        raise NotImplementedError

def reproduce_bug():
    ...
```

Tasks:

1. Implement `quorum_read` as described in the setup comment; run `reproduce_bug` and confirm the nonlinearizable schedule.
2. …

## 7. Prerequisites and install guidance

- Before the setup, list everything that must be installed or available (runtime, CLI tools, Docker, packages, OS notes).
- If nothing beyond a common language runtime is needed, say so explicitly in one prose line (e.g. `Prerequisites: Python 3.10+`) and skip the install block.
- When install or start steps are required, put them in **one** fenced code block (prefer `bash`) — not as inline prose commands. Use `#` comments to label OS/platform variants and confirm steps.

Example:

````
Prerequisites: PostgreSQL 16+ with `psql` on your PATH.

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Debian/Ubuntu
sudo apt install postgresql

# Confirm install
psql --version
```
````

## Quick checklist

| # | Rule | Where |
| --- | --- | --- |
| 1 | Hands-on, reproducible from brief alone | `question` |
| 2 | All multi-line code in ``` fences | `question`, `answer` |
| 3 | Numbered steps `1.` `2.` … | `question` |
| 4 | No `#` headings / decorative markdown outside fences | `task`, `question`, `answer` |
| 5 | Full setup+changes in reference, not a fragment | `answer` |
| 6 | Setup present, runnable as given, with inline implement-here comments at edit sites | `question` |
| 7 | Prerequisites listed; non-trivial installs in one commented fenced block | `question` |
