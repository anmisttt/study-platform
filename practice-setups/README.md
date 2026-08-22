# Practice task Docker setups

Pre-seeded lab environments for hands-on practice tasks, published to **GHCR** as `ghcr.io/anmisttt/ddia-practice:<tag>` (one tag per practice item, e.g. `ch1-p0`).

## Quick start (student)

```bash
# Start pre-seeded Postgres lab
docker run -d --name lab-ch1-p0 -p 5432:5432 ghcr.io/anmisttt/ddia-practice:ch1-p0

# Copy stub files into your working directory
docker run --rm -v "$PWD:/out" ghcr.io/anmisttt/ddia-practice:ch1-p0 init

# Connect
docker exec -it lab-ch1-p0 psql -U postgres -d retail_lab

# Teardown
docker rm -f lab-ch1-p0
```

Multi-service tasks (Kafka, RabbitMQ, Citus, etc.) use `docker compose`:

```bash
docker run --rm -v "$PWD:/out" ghcr.io/anmisttt/ddia-practice:ch12-p0 init
docker compose up -d
docker compose down -v   # teardown
```

## Maintainer workflow

```bash
cd practice-setups
chmod +x build.sh

# Build pg16 base + one task locally (same tag as GHCR)
./build.sh ch1-p0

# Smoke-test a postgres task
./build.sh verify ch1-p0

# Convert not-yet-migrated tasks: generate task dirs + rewrite their briefs
python3 generate.py
```

`generate.py` only touches practice items whose `question` does not yet start with `Prerequisites: Docker Engine 24+`. Once a brief is migrated, its `seed.sql` and `scaffold/` are the source of truth (the bulk seed no longer lives in the brief), so edit those and the brief by hand to match [STYLEGUIDE](../.agents/skills/validate-practice-tasks/STYLEGUIDE.md) §8.

## Layout

| Path | Purpose |
|------|---------|
| `bases/pg16/` | Shared PostgreSQL 16 base with `init` entrypoint |
| `tasks/chN-pI/` | Per-task Dockerfile, `seed.sql`, `scaffold/` |
| `manifest.json` | Tag → metadata (kind, db, port) |
| `docker-bake.hcl` | Bake targets for CI and local multi-arch builds |
| `generate.py` | Extract seeds from chapter JSON and rewrite briefs |

## Image kinds

- **postgres-baked** — Postgres 16 with seed data applied at build time (`PGDATA=/lab/pgdata`).
- **compose-stack** — Delivery image; `init` copies `docker-compose.yml` + seeds; student runs `docker compose up -d`.
- **python-lab** — Python 3.12 with pip deps; `init` copies stub scripts.

Fifteen stdlib-only Python tasks have no image (unchanged briefs).

## CI

`.github/workflows/practice-images.yml` builds and pushes to GHCR on changes under `practice-setups/`.

**One-time setup:** set the `ddia-practice` package visibility to **public** in GitHub → Packages so students can pull without login.

## Tag convention

`ch<N>-p<I>` matches frontend question ids `practice-<I>` in chapter `<N>` (e.g. `first_chapter` → chapter 1 → `ch1-p0`).
