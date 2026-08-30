# Practice task styleguide

Canonical format for every `practice[]` item in `backend/src/data/*_chapter.json`.
Fields: `task` (short title), `question` (student-facing brief), `answer` (perfect reference).

## 1. Purpose-led title and reproducible task

- `task` must begin with a concrete technology label in square brackets and explain the main learning purpose in plain, learner-oriented language. When several technologies are used, list them inside the brackets separated by a comma and one space, for example `[Kafka, PostgreSQL]`; do not join them with `+`, `/`, or `vs`. Prefer a concise outcome such as `[RDFLib, SPARQL] Learn how to work with triple stores.`
- Do not use the title as a compressed implementation instruction or data-model description, such as `Query package dependencies as subject-predicate-object triples.` Put those mechanics in the numbered tasks instead.
- Keep the title free of Markdown emphasis, task numbering, and setup details beyond the required leading `[Technology]` label.
- The item is a hands-on exercise a student can run locally, not a free-form essay.
- Steps are concrete and reproducible from `task` + `question` alone (filenames, commands, expected signals).
- A careful student should not need unspoken tools, ports, env vars, or side knowledge.

## 2. Fenced code blocks

- Every allowed code or shell snippet in `question` and `answer` must be wrapped in triple-backtick fences (```).
- In `question`, code fences may contain operational lab commands or task-relevant starter code. Starter code must remain incomplete and must not contain completed solution logic or fragments copied from the reference answer.
- Do not leave multi-line code as indented plain text outside fences.
- Put a language tag on the opening fence when the block is one of the supported highlight languages. The UI highlights from the fence tag only (no content auto-detect); unlabeled or unknown tags render as plain escaped text.
- Supported highlight languages (and aliases):
  - `sql` — also `pgsql`, `postgres`, `postgresql`, `plpgsql`
  - `python` — also `py`
  - `bash` — also `sh`, `shell`, `zsh`
  - `json`
- Example: use ` ```sql ` / ` ```python ` / ` ```bash ` / ` ```json `, not a bare ` ``` `.

## 3. Numbered task steps

- Student work items in `question` must be numbered: `1.`, `2.`, `3.`, …
- Prefer a short lead-in such as `Tasks:` then the numbered list.
- Do not use only bullets or unnumbered paragraphs for the required work.
- Do not organize work as `Part A`, `Part B`, lettered sections, or prose references to those labels. Convert each required part into the numbered task list and refer back to it as `Task 1`, `Task 2`, and so on.

## 4. No markdown decoration outside code fences

- In `task`, `question`, and `answer`, do **not** use markdown headings or other structural markdown outside fenced code.
  - Forbidden outside fences: `#` / `##` / … headings, `**bold**`, `*italic*` emphasis used as decoration, `>` blockquotes, `|` tables, horizontal rules.
- Allowed outside fences: plain prose, numbered/bulleted lists, inline `` `backticks` `` for short identifiers/commands.
- Inside fenced code, language-native `#` comments and other syntax are fine.

## 5. Answer is the full setup plus required changes

- `answer` must include the complete runnable artifact(s) derived from the initial setup, with every change the tasks require already applied.
- Do not ship only a diff, a fragment, or “add these lines” patches unless the question explicitly asks for a patch format.
- Keep any short write-up as plain prose (no `#` headings); put all code in fences.

## 6. Separate starter code from task instructions

- `question` may include task-relevant starter code, incomplete function bodies, and short edit-site markers such as `-- implement: ...` or `# TODO: ...`. These markers are encouraged when they make the intended edit location obvious.
- Keep markers terse: identify the feature or location only. Do not put detailed requirements, algorithms, acceptance criteria, expected outputs, or step-by-step implementation guidance inside code comments.
- Put the full requirements after the relevant code block in the numbered `Tasks:` list. The numbered tasks are the single source of truth; do not duplicate or split their instructions between code comments and prose.
- Starter code must not contain completed solution logic, near-complete pseudocode, or fragments copied or adapted from the reference answer.
- Non-task infrastructure code, including schema creation and seed inserts that the student is not meant to implement, belongs in container initialization rather than the student-facing scaffold.
- Allowed prose details include artifact and object names, required columns or interfaces, constraints, required operations or algorithms, filenames, behavioral requirements, and expected outcomes.
- Keep the brief reproducible by stating exact artifacts, commands, constraints, and success signals in the numbered tasks without revealing the solution.

Allowed pattern:

```sql
-- implement: lookup-table schema
-- TODO: migrate raw job postings into normalized tables
```

Tasks:

1. Create `ch2_companies`, `ch2_cities`, and `ch2_job_categories`, each with an `id` and unique `name`.
2. Create `ch2_job_postings` with foreign keys, then migrate `ch2_job_postings_raw` using distinct lookup inserts and a join-based migration. Use the renamed company values produced in Task 1.

## 7. Prerequisites and install guidance

- Before the setup, list everything that must be installed or available (runtime, CLI tools, Docker, packages, OS notes).
- If nothing beyond a common language runtime is needed, say so explicitly in one prose line (e.g. `Prerequisites: Python 3.10+`) and skip the install block.
- When install or start steps are required, put them in **one** fenced code block (prefer `bash`) — not as inline prose commands. Use `#` comments to label OS/platform variants and confirm steps.

Example (native install):

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

## 8. Docker-backed setups (GHCR)

Tasks that need databases, brokers, or pip-heavy tooling should use a published lab image instead of brew/apt install steps.

- Prerequisites line: `Prerequisites: Docker Engine 24+ (or Docker Desktop).`
- Put **one** fenced `bash` block with: `docker run` (start lab or `init`), scaffold copy (`docker run --rm -v "$PWD:/out" IMAGE init`), connect/exec step, and **teardown** (`docker rm -f …` or `docker compose down -v`).
- Image reference: `ghcr.io/anmisttt/ddia-practice:ch<N>-p<I>` (matches question id `practice-<I>` in chapter `<N>`).
- Bulk seed data and schema that are not student work live in the image and are provisioned during container initialization.
- The image's `init` command supplies starter files. The brief may also show the task-relevant starter scaffold when useful, including terse `-- implement:` or `TODO` markers, but it must keep detailed instructions in the numbered tasks after the code block.
- When schema or data changes are student work, the starter SQL may mark the edit sites without implementing them. Describe the required objects, constraints, operations, and results in the numbered tasks.
- Multi-service labs: `init` copies `docker-compose.yml`; student runs `docker compose up -d` on the host.
- Every docker brief must include an explicit teardown command so solvers leave no orphaned containers.
- **Never** tell students to run DB/client CLIs on the host (`psql`, `clickhouse-client`, `mysql`, `mongosh`, `etcdctl`, …) when the lab runs in Docker. Always prefix with the container entrypoint:
  - Single container: `docker exec -i lab-chN-pI …` (use `-i` for stdin redirects; `-it` for interactive).
  - Compose stack: `docker compose exec -T <service> …` (use `-T` for stdin redirects / scripts; omit `-T` for interactive).
  - Wrong: `clickhouse-client --multiquery < setup.sql`
  - Right: `docker compose exec -T clickhouse clickhouse-client --multiquery < setup.sql`
- Do not add a second Prerequisites line that asks for host `psql` / local Postgres / ClickHouse when the GHCR image or compose stack already provides the engine.
- If a student script shells out to a client CLI, the subprocess must use `docker exec` / `docker compose exec` (or a language driver to the published port) — not a bare host binary.

Example (single container):

````
Prerequisites: Docker Engine 24+ (or Docker Desktop).

```bash
docker run -d --name lab-ch1-p0 -p 5432:5432 ghcr.io/anmisttt/ddia-practice:ch1-p0
docker run --rm -v "$PWD:/out" ghcr.io/anmisttt/ddia-practice:ch1-p0 init
docker exec -i lab-ch1-p0 psql -v ON_ERROR_STOP=1 -U postgres -d retail_lab < setup.sql
docker exec -it lab-ch1-p0 psql -U postgres -d retail_lab

# Teardown
docker rm -f lab-ch1-p0
```
````

Example (compose / ClickHouse):

````
Prerequisites: Docker Engine 24+ (or Docker Desktop).

```bash
docker run --rm -v "$PWD:/out" ghcr.io/anmisttt/ddia-practice:ch4-p4 init
docker compose up -d
docker compose exec -T clickhouse clickhouse-client --multiquery < setup.sql
docker compose exec clickhouse clickhouse-client

# Teardown
docker compose down -v
```
````

Stdlib-only Python tasks (no broker/DB) stay on native Python prerequisites and do **not** need a lab image.

## 9. Real-world tools and workflow

- Before writing the task or its setup, understand how practitioners perform the work in a real system. Verify the current product, native CLI/API, configuration and data formats, normal command sequence, and expected signals using official documentation or another primary source.
- Use those real-world tools in the task, starter scaffold, reference answer, and container setup. All four must describe and exercise the same instrument and workflow.
- Prefer native interfaces and artifacts: for example, the product's actual client, migration/config files, schemas, and operational commands—not a custom script that imitates the product's behavior.
- A laptop lab may reduce scale, replicas, partitions, data volume, or runtime, but it must preserve the essential practitioner workflow and the concept being taught.
- Do not substitute a mock, toy database, in-memory reimplementation, or hand-written simulator when the authentic tool can run safely in Docker. If the authentic workflow cannot be made runnable, choose a different practical exercise rather than silently teaching an imitation.
- Verify version-specific commands and APIs against the tool version pinned by the setup, then smoke-test the documented workflow before considering the item complete.

## Quick checklist

| # | Rule | Where |
| --- | --- | --- |
| 1 | Title begins with `[Technology]` (or comma-separated `[Technology, Technology]`) and states the learning goal; exercise is hands-on and reproducible from the brief | `task`, `question` |
| 2 | Operational commands and task-relevant starter code use tagged fences; starter code contains no completed solution | `question`, `answer` |
| 3 | Required work uses numbered tasks `1.`, `2.`, …; no `Part A` / `Part B` or lettered sections | `question` |
| 4 | No `#` headings / decorative markdown outside fences | `task`, `question`, `answer` |
| 5 | Full setup+changes in reference, not a fragment | `answer` |
| 6 | Starter code may use terse implement/TODO markers; detailed instructions appear only in numbered tasks after the code block | `question` |
| 7 | Prerequisites listed; non-trivial installs in one commented fenced block | `question` |
| 8 | Docker tasks: GHCR image supplies non-task setup; task scaffolds may have terse markers, with details in numbered tasks | `question` |
| 9 | Task and setup use a verified real-world tool, native workflow, and matching versioned commands; scale reduction does not replace the tool with a toy | `question`, `answer`, setup assets |
