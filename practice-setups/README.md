# Practice task Docker setups

Pre-seeded lab environments for hands-on practice tasks, published to **GHCR** as `ghcr.io/anmisttt/lab:<tag>` (one tag per practice item, e.g. `ch1-p1`).

## Quick start (student)

```bash
# Start pre-seeded Postgres lab
docker run -d --name lab-ch1-p1 -p 5432:5432 ghcr.io/anmisttt/lab:ch1-p1

# Copy stub files into your working directory
docker run --rm -v "$PWD:/out" ghcr.io/anmisttt/lab:ch1-p1 init

# Connect / apply SQL inside the container (never bare host psql)
docker exec -i lab-ch1-p1 psql -v ON_ERROR_STOP=1 -U postgres -d retail_lab < setup.sql
docker exec -it lab-ch1-p1 psql -U postgres -d retail_lab

# Teardown
docker rm -f lab-ch1-p1
```

Multi-service tasks (Kafka, RabbitMQ, Citus, ClickHouse, etc.) use `docker compose`. Client CLIs always go through `docker compose exec` — never a bare host `psql` / `clickhouse-client` / `mysql`:

```bash
docker run --rm -v "$PWD:/out" ghcr.io/anmisttt/lab:ch4-p5 init
docker compose up -d
docker compose exec -T clickhouse clickhouse-client --multiquery < setup.sql
docker compose exec clickhouse clickhouse-client
docker compose down -v   # teardown
```

## Maintainer workflow

Only exercises that need a containerized service or packaged dependencies appear here. Tasks that run with the standard library or existing local tools do not need an image.

```bash
cd practice-setups

# Build one Docker-backed task
./build.sh ch1-p1

# Smoke-test a postgres task
./build.sh verify ch1-p1

# Build all configured practice images
./build.sh all
```

Task assets are the source of truth. There is no generated manifest or per-task Dockerfile: Docker Bake expands compact PostgreSQL, Python-delivery, and Node-delivery task lists and uses their shared Dockerfiles. Edit task assets and the corresponding chapter brief together, following [STYLEGUIDE](../.agents/skills/validate-practice-tasks/STYLEGUIDE.md) §§8–9.

## Layout

| Path | Purpose |
|------|---------|
| `common/` | Shared `init` entrypoint for all lab images |
| `images/` | Shared PostgreSQL, Python-delivery, and Node-delivery Dockerfiles |
| `tasks/chN-pI/` | Per-task seed, requirements, and student scaffold |
| `docker-bake.hcl` | Task inventory plus local/CI build configuration |

## Adding an image

Do this only when the exercise needs a containerized service or dependencies that should be packaged for the learner.

Before writing setup assets, verify how practitioners perform the task using current official documentation: identify the real product, native client/API, configuration and data files, normal command sequence, and expected signals. Package and expose those same instruments in the lab. Reduce scale to fit a laptop, but do not replace a Docker-runnable real tool or workflow with a custom simulator, mock, or hand-written approximation.

1. Add `tasks/chN-pI/scaffold/` and the task-specific inputs: `seed.sql` for a PostgreSQL image and, when needed, `requirements.txt` for a delivery image.
2. Add one object to `POSTGRES_TASKS`, `DELIVERY_TASKS`, or `NODE_DELIVERY_TASKS` in `docker-bake.hcl`, including its database name or any OS packages when that image kind needs them.
3. Run `./check-tag-drift.sh`, then `./build.sh chN-pI`.

## Image kinds

- **postgres-baked** — PostgreSQL 16 with seed data applied at build time (`PGDATA=/lab/pgdata`).
- **compose-stack** — Delivery image; `init` copies `docker-compose.yml` + seeds; student runs `docker compose up -d`.
- **python-lab** — Python 3.12 with pip deps; `init` copies stub scripts.
- **node-lab** — Node.js 24 with pinned npm deps; `init` copies stub scripts and Compose assets.

Fifteen stdlib-only Python tasks have no image (unchanged briefs).

## CI

`.github/workflows/practice-images.yml` builds and pushes to GHCR only when image inputs under `practice-setups/` change. A task-directory change builds that task, while shared image changes rebuild all images. Chapter JSON changes run the drift check without rebuilding images. Manual dispatch accepts an optional chapter number and one-based practice number: blank chapter builds everything; chapter alone builds every image in it; chapter plus task builds only `chN-pI`.

## Tag convention

`ch<N>-p<I>` uses a one-based practice ordinal. It maps to `practice[I - 1]` in chapter `<N>` and frontend question id `practice-<I - 1>` (for example, `first_chapter` practice 1 uses `ch1-p1` and question id `practice-0`).
