# Practice task Docker setups

Pre-seeded lab environments for hands-on practice tasks, published to **GHCR** as `ghcr.io/anmisttt/ddia-practice:<tag>` (one tag per practice item, e.g. `ch1-p0`).

## Quick start (student)

```bash
# Start pre-seeded Postgres lab
docker run -d --name lab-ch1-p0 -p 5432:5432 ghcr.io/anmisttt/ddia-practice:ch1-p0

# Copy stub files into your working directory
docker run --rm -v "$PWD:/out" ghcr.io/anmisttt/ddia-practice:ch1-p0 init

# Connect / apply SQL inside the container (never bare host psql)
docker exec -i lab-ch1-p0 psql -v ON_ERROR_STOP=1 -U postgres -d retail_lab < setup.sql
docker exec -it lab-ch1-p0 psql -U postgres -d retail_lab

# Teardown
docker rm -f lab-ch1-p0
```

Multi-service tasks (Kafka, RabbitMQ, Citus, ClickHouse, etc.) use `docker compose`. Client CLIs always go through `docker compose exec` — never a bare host `psql` / `clickhouse-client` / `mysql`:

```bash
docker run --rm -v "$PWD:/out" ghcr.io/anmisttt/ddia-practice:ch4-p4 init
docker compose up -d
docker compose exec -T clickhouse clickhouse-client --multiquery < setup.sql
docker compose exec clickhouse clickhouse-client
docker compose down -v   # teardown
```

## Maintainer workflow

Only exercises that need a containerized service or packaged dependencies appear here. Tasks that run with the standard library or existing local tools do not need an image.

```bash
cd practice-setups

# Build one Docker-backed task (a required shared base is automatic)
./build.sh ch1-p0

# Smoke-test a postgres task
./build.sh verify ch1-p0

# Build all configured practice images
./build.sh all
```

Task assets are the source of truth. There is no generated manifest or per-task Dockerfile: Docker Bake expands two compact task lists and uses the shared PostgreSQL or delivery Dockerfile. Edit task assets and the corresponding chapter brief together, following [STYLEGUIDE](../.agents/skills/validate-practice-tasks/STYLEGUIDE.md) §8.

## Layout

| Path | Purpose |
|------|---------|
| `bases/pg16/` | Shared PostgreSQL 16 base with `init` entrypoint |
| `images/` | Shared PostgreSQL and delivery Dockerfiles |
| `tasks/chN-pI/` | Per-task seed, requirements, and student scaffold |
| `docker-bake.hcl` | Task inventory plus local/CI build configuration |

## Adding an image

Do this only when the exercise needs a containerized service or dependencies that should be packaged for the learner.

1. Add `tasks/chN-pI/scaffold/` and the task-specific inputs: `seed.sql` for a PostgreSQL image and, when needed, `requirements.txt` for a delivery image.
2. Add one object to `POSTGRES_TASKS` or `DELIVERY_TASKS` in `docker-bake.hcl`, including its database name or any OS packages.
3. Run `./check-tag-drift.sh`, then `./build.sh chN-pI`.

## Image kinds

- **postgres-baked** — PostgreSQL 16 with seed data applied at build time (`PGDATA=/lab/pgdata`).
- **compose-stack** — Delivery image; `init` copies `docker-compose.yml` + seeds; student runs `docker compose up -d`.
- **python-lab** — Python 3.12 with pip deps; `init` copies stub scripts.

Fifteen stdlib-only Python tasks have no image (unchanged briefs).

## CI

`.github/workflows/practice-images.yml` builds and pushes to GHCR only when image inputs under `practice-setups/` change. A task-directory change builds that task, while shared image changes rebuild all images. Chapter JSON changes do not trigger image builds. Manual dispatch accepts an optional chapter number and zero-based practice index: blank chapter builds everything; chapter alone builds every image in it; chapter plus task builds only `chN-pI`.

**One-time setup:** set the `ddia-practice` package visibility to **public** in GitHub → Packages so students can pull without login.

## Tag convention

`ch<N>-p<I>` matches frontend question ids `practice-<I>` in chapter `<N>` (e.g. `first_chapter` → chapter 1 → `ch1-p0`).
