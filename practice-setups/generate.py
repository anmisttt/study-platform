#!/usr/bin/env python3
"""Generate practice-setups task dirs, manifest, docker-bake.hcl, and rewrite chapter briefs."""

from __future__ import annotations

import json
import re
import shutil
import textwrap
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATA_DIR = REPO / "backend" / "src" / "data"
SETUPS_DIR = REPO / "practice-setups"
TASKS_DIR = SETUPS_DIR / "tasks"
BASES_DIR = SETUPS_DIR / "bases"
COMMON_ENTRY = BASES_DIR / "common" / "lab-init-entrypoint.sh"

REGISTRY = "ghcr.io/anmisttt"
TASK_PKG = "ddia-practice"
BASE_PKG = "ddia-practice-base"

FENCE_RE = re.compile(r"```(\w+)?\n(.*?)```", re.DOTALL)
DOCKER_PREREQ = "Prerequisites: Docker Engine 24+"


@dataclass
class TaskSpec:
    tag: str
    chapter: int
    index: int
    chapter_file: str
    kind: str
    base: str
    db: str = ""
    port: int = 0
    container_name: str = ""
    cap_add: list[str] = field(default_factory=list)
    scaffold_files: dict[str, str] = field(default_factory=dict)
    seed_sql: str = ""
    compose_yml: str = ""
    pip_packages: list[str] = field(default_factory=list)
    converted: bool = False


def load_chapters() -> list[tuple[str, dict]]:
    chapters = []
    for path in sorted(DATA_DIR.glob("*_chapter.json")):
        raw = json.loads(path.read_text())
        if isinstance(raw, list):
            raw = raw[0]
        chapters.append((path.name, raw))
    return chapters


def load_manifest_tasks() -> dict:
    path = SETUPS_DIR / "manifest.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text()).get("tasks", {})


def is_converted(question: str) -> bool:
    """True once a brief has been migrated to a lab image.

    Converted briefs are maintained by hand: the bulk seed no longer lives in
    the question, so re-deriving seeds and scaffolds from it would strip data.
    """
    return question.lstrip().startswith(DOCKER_PREREQ)


def tag_for(chapter_num: int, index: int) -> str:
    return f"ch{chapter_num}-p{index}"


def extract_fenced(text: str) -> list[tuple[str, str]]:
    return [(m.group(1) or "", m.group(2)) for m in FENCE_RE.finditer(text)]


def extract_sql_blocks(text: str) -> list[str]:
    langs = {"sql", "pgsql", "postgres", "postgresql"}
    return [body for lang, body in extract_fenced(text) if lang.lower() in langs]


def detect_db_name(question: str, task_title: str = "") -> str:
    for pat in [
        r"createdb\s+(\w+)",
        r"psql\s+-d\s+(\w+)",
        r"dbname=(\w+)",
        r"POSTGRES_DB=(\w+)",
        r'DB\s*=\s*["\'](\w+)',
    ]:
        m = re.search(pat, question)
        if m:
            return m.group(1)
    return "lab"


def is_python_only(question: str, task_title: str) -> bool:
    q = question.lower()
    if re.search(r"postgresql|psql|postgres", task_title, re.I):
        return False
    if re.search(r"prerequisites:\s*python[^\n]*only", q):
        return True
    if "stdlib only" in q or "no extra packages" in q:
        return True
    if "no pip packages required" in q:
        return True
    return False


def needs_docker(question: str, task_title: str) -> bool:
    if is_python_only(question, task_title):
        return False
    q = question.lower()
    t = task_title.lower()
    markers = [
        "postgresql", "psql", "postgres", "kafka", "rabbitmq", "elasticsearch",
        "orientdb", "etcd", "mysql", "mongodb", "mongo", "clickhouse", "citus",
        "docker run", "pip install", "mrjob", "fastapi", "tc/netem", "tcpdump",
        "pika", "psycopg",
    ]
    return any(m in q or m in t for m in markers)


def classify_kind(question: str, task_title: str) -> str:
    q = question.lower()
    t = task_title.lower()
    if "citus" in q or "citus" in t:
        return "compose-stack"
    if ("kafka" in q or "kafka" in t) and ("postgresql" in q or "postgres" in q or "psycopg" in q):
        return "compose-stack"
    if "rabbitmq" in q or "rabbitmq" in t:
        return "compose-stack"
    if "kafka" in q or "kafka" in t:
        return "compose-stack"
    if "elasticsearch" in q or "elasticsearch" in t:
        return "compose-stack"
    if "orientdb" in q or "orientdb" in t:
        return "compose-stack"
    if "etcd" in q or "etcd" in t:
        return "compose-stack"
    if "mysql" in q or "innodb" in t:
        return "compose-stack"
    if "clickhouse" in q or "clickhouse" in t:
        return "compose-stack"
    if "tc/netem" in q or ("tcpdump" in q and "docker" in q):
        return "compose-stack"
    if "pip install" in q or "mrjob" in q or "fastapi" in q:
        if "postgresql" in q or "psql" in q:
            return "postgres-baked" if "kafka" not in q else "compose-stack"
        return "python-lab"
    if "postgresql" in q or "psql" in q or "postgres" in t:
        return "postgres-baked"
    return "python-lab"


def sql_without_bulk_inserts(sql: str) -> str:
    lines = sql.splitlines()
    result: list[str] = []
    in_insert = False
    for line in lines:
        if re.match(r"^\s*INSERT\s+INTO", line, re.I):
            in_insert = not line.strip().endswith(";")
            continue
        if in_insert:
            in_insert = not line.strip().endswith(";")
            continue
        result.append(line)
    return "\n".join(result).strip()


def extract_intro(question: str) -> str:
    """Narrative prose excluding prerequisites, install blocks, and fenced code."""
    text = question
    # Drop leading Prerequisites line + following bash fence
    text = re.sub(
        r"^Prerequisites:[^\n]*\n+(?:```bash\n.*?```\n+)?",
        "",
        text,
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )
    # Drop createdb / psql -f ceremony paragraphs
    text = re.sub(r"Create the lab database:\n\n```bash\n.*?```\n+", "", text, flags=re.DOTALL)
    text = re.sub(r"Save the file below as `[^`]+`, then apply it:\n\n```bash\n.*?```\n+", "", text, flags=re.DOTALL)
    text = re.sub(r"Run the seed below[^\n]*\n+", "", text)
    # Take prose before first fenced block
    parts = re.split(r"\n\n```", text, maxsplit=1)
    intro = parts[0].strip()
    intro = re.sub(r"\n{3,}", "\n\n", intro)
    if intro.lower().startswith("prerequisites"):
        return ""
    return intro


def extract_expected_section(question: str) -> str:
    start = question.find("Expected ")
    if start == -1:
        return ""
    rest = question[start:]
    tasks_idx = rest.find("\n\nTasks:")
    if tasks_idx != -1:
        rest = rest[:tasks_idx]
    return rest.strip()


def extract_tasks_section(question: str) -> str:
    idx = question.find("Tasks:")
    if idx == -1:
        return ""
    return question[idx:].strip()


def inline_python_blocks(question: str) -> list[str]:
    blocks = []
    for lang, body in extract_fenced(question):
        if lang.lower() in ("python", "py"):
            blocks.append(f"```python\n{body.strip()}\n```")
    return blocks


def inline_sql_reference(question: str, spec: TaskSpec) -> str:
    sql_blocks = extract_sql_blocks(question)
    if not sql_blocks:
        return ""
    sql = sql_blocks[0]
    if spec.kind == "postgres-baked":
        sql = sql_without_bulk_inserts(sql)
    return f"```sql\n{sql.strip()}\n```"


def docker_block(spec: TaskSpec) -> str:
    image = f"{REGISTRY}/{TASK_PKG}:{spec.tag}"
    name = spec.container_name or f"lab-{spec.tag}"
    lines: list[str] = []
    if spec.kind == "compose-stack":
        lines.extend([
            f"docker run --rm -v \"$PWD:/out\" {image} init",
            "docker compose up -d",
            "",
            "# Teardown",
            "docker compose down -v",
        ])
        if spec.pip_packages:
            lines.insert(2, f"# Python deps are preinstalled in the lab image; or: pip install {' '.join(spec.pip_packages)}")
    elif spec.kind == "python-lab":
        lines.extend([
            f"docker run --rm -v \"$PWD:/out\" {image} init",
            f"docker run --rm -it -v \"$PWD:/work\" -w /work {image} bash",
            "",
            "# Teardown: remove scaffold files if desired",
        ])
    else:
        port_flag = f" -p {spec.port}:{spec.port}" if spec.port else ""
        lines.extend([
            f"docker run -d --name {name}{port_flag} {image}",
            f"docker run --rm -v \"$PWD:/out\" {image} init",
        ])
        if spec.db:
            lines.append(f"docker exec -it {name} psql -U postgres -d {spec.db}")
        lines.extend(["", "# Teardown", f"docker rm -f {name}"])
    return "\n".join(lines)


def rewrite_question(original: str, spec: TaskSpec) -> str:
    intro = extract_intro(original)
    expected = extract_expected_section(original)
    tasks = extract_tasks_section(original)
    sql_ref = inline_sql_reference(original, spec)
    py_blocks = inline_python_blocks(original)

    parts: list[str] = [
        "Prerequisites: Docker Engine 24+ (or Docker Desktop).",
        "",
        f"```bash\n{docker_block(spec)}\n```",
    ]
    if intro:
        parts.extend(["", intro])
    if sql_ref:
        parts.extend(["", sql_ref])
    for py in py_blocks:
        parts.extend(["", py])
    if expected:
        parts.extend(["", expected])
    if tasks:
        parts.extend(["", tasks])
    return "\n".join(parts)


def copy_entrypoint(task_dir: Path) -> None:
    shutil.copy(COMMON_ENTRY, task_dir / "lab-init-entrypoint.sh")


def write_postgres_task(spec: TaskSpec) -> None:
    task_dir = TASKS_DIR / spec.tag
    task_dir.mkdir(parents=True, exist_ok=True)
    sql = spec.seed_sql or spec.scaffold_files.get("setup.sql", "")
    (task_dir / "seed.sql").write_text(sql.strip() + "\n")
    scaffold_dir = task_dir / "scaffold"
    scaffold_dir.mkdir(exist_ok=True)
    named = {n: c for n, c in spec.scaffold_files.items() if n != "setup.sql"}
    for name, content in named.items():
        (scaffold_dir / name).write_text(content)
    # The copied file must restore the state the image was built with, so it
    # carries the seed rows too; stripping them would wipe the pre-seeded data.
    if sql and not any(c.strip() == sql.strip() for c in named.values()):
        (scaffold_dir / "setup.sql").write_text(sql.strip() + "\n")
    copy_entrypoint(task_dir)
    dockerfile = textwrap.dedent(
        f"""\
        ARG BASE_IMAGE={REGISTRY}/{BASE_PKG}:pg16
        FROM ${{BASE_IMAGE}}

        ENV PGDATA=/lab/pgdata \\
            POSTGRES_DB={spec.db} \\
            POSTGRES_PASSWORD=lab \\
            POSTGRES_USER=postgres

        COPY seed.sql /lab/seed.sql
        COPY scaffold/ /lab/scaffold/
        COPY lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
        RUN chmod +x /usr/local/bin/lab-entrypoint.sh && mkdir -p /lab && chown -R postgres:postgres /lab

        USER postgres
        RUN initdb -D "$PGDATA" \\
         && pg_ctl -D "$PGDATA" -o "-c listen_addresses=''" -w start \\
         && psql -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE {spec.db}" \\
         && psql -v ON_ERROR_STOP=1 -d {spec.db} -f /lab/seed.sql \\
         && pg_ctl -D "$PGDATA" -m fast -w stop

        USER root
        ENTRYPOINT ["lab-entrypoint.sh"]
        CMD ["postgres"]
        """
    )
    (task_dir / "Dockerfile").write_text(dockerfile)


def write_delivery_task(spec: TaskSpec, pip_install: bool = False) -> None:
    task_dir = TASKS_DIR / spec.tag
    task_dir.mkdir(parents=True, exist_ok=True)
    scaffold_dir = task_dir / "scaffold"
    scaffold_dir.mkdir(exist_ok=True)
    for name, content in spec.scaffold_files.items():
        (scaffold_dir / name).write_text(content)
    if spec.seed_sql:
        (scaffold_dir / "seed.sql").write_text(spec.seed_sql.strip() + "\n")
    if spec.compose_yml:
        (scaffold_dir / "docker-compose.yml").write_text(spec.compose_yml)
    copy_entrypoint(task_dir)
    req_line = ""
    run_pip = ""
    if pip_install and spec.pip_packages:
        (task_dir / "requirements.txt").write_text("\n".join(spec.pip_packages) + "\n")
        req_line = "COPY requirements.txt /tmp/requirements.txt"
        run_pip = "RUN pip install --no-cache-dir -r /tmp/requirements.txt"
    dockerfile = textwrap.dedent(
        f"""\
        FROM python:3.12-slim-bookworm
        WORKDIR /work
        {req_line}
        {run_pip}
        COPY lab-init-entrypoint.sh /usr/local/bin/lab-entrypoint.sh
        RUN chmod +x /usr/local/bin/lab-entrypoint.sh
        COPY scaffold/ /lab/scaffold/
        ENTRYPOINT ["lab-entrypoint.sh"]
        CMD ["bash"]
        """
    )
    (task_dir / "Dockerfile").write_text(dockerfile)


def write_python_lab_task(spec: TaskSpec) -> None:
    spec.pip_packages = spec.pip_packages or []
    write_delivery_task(spec, pip_install=bool(spec.pip_packages))


def write_compose_task(spec: TaskSpec) -> None:
    write_delivery_task(spec, pip_install=bool(spec.pip_packages))


def drop_seed_mount(yml: str) -> str:
    """Templates mount ./seed.sql; drop it when the task has no seed to copy."""
    out: list[str] = []
    for line in yml.splitlines():
        if "./seed.sql:/docker-entrypoint-initdb.d" in line:
            if out and out[-1].strip() == "volumes:":
                out.pop()
            continue
        out.append(line)
    return "\n".join(out) + "\n"


def compose_for(spec: TaskSpec) -> str:
    yml = compose_template(spec)
    return yml if spec.seed_sql else drop_seed_mount(yml)


def compose_template(spec: TaskSpec) -> str:
    db = spec.db or "lab"
    if "kafka" in spec.tag or any("kafka" in f for f in spec.scaffold_files):
        if spec.db and "eos" in spec.db:
            return textwrap.dedent(
                f"""\
                services:
                  postgres:
                    image: postgres:16-bookworm
                    environment:
                      POSTGRES_PASSWORD: postgres
                      POSTGRES_USER: postgres
                      POSTGRES_DB: {db}
                    ports:
                      - "5433:5432"
                    volumes:
                      - ./seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
                  kafka:
                    image: apache/kafka:3.9.1
                    ports:
                      - "9092:9092"
                    environment:
                      KAFKA_NODE_ID: 1
                      KAFKA_PROCESS_ROLES: broker,controller
                      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
                      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
                      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
                      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
                      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
                """
            )
        return textwrap.dedent(
            """\
            services:
              kafka:
                image: apache/kafka:3.9.1
                ports:
                  - "9092:9092"
                environment:
                  KAFKA_NODE_ID: 1
                  KAFKA_PROCESS_ROLES: broker,controller
                  KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
                  KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
                  KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
                  KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
                  KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
            """
        )
    if "rabbitmq" in spec.tag:
        return textwrap.dedent(
            """\
            services:
              rabbitmq:
                image: rabbitmq:3.13-management
                ports:
                  - "5672:5672"
                  - "15672:15672"
            """
        )
    if "es" in spec.tag or "elasticsearch" in json.dumps(spec.scaffold_files).lower():
        return textwrap.dedent(
            """\
            services:
              elasticsearch:
                image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
                ports:
                  - "9200:9200"
                environment:
                  discovery.type: single-node
                  xpack.security.enabled: "false"
            """
        )
    if "orientdb" in spec.tag:
        return textwrap.dedent(
            """\
            services:
              orientdb:
                image: orientdb:3.2.55
                ports:
                  - "2424:2424"
                  - "2480:2480"
                environment:
                  ORIENTDB_ROOT_PASSWORD: root
            """
        )
    if "etcd" in spec.tag:
        return textwrap.dedent(
            """\
            services:
              etcd:
                image: gcr.io/etcd-development/etcd:v3.5.16
                ports:
                  - "2379:2379"
                command:
                  - etcd
                  - --advertise-client-urls=http://0.0.0.0:2379
                  - --listen-client-urls=http://0.0.0.0:2379
            """
        )
    if "mysql" in spec.tag:
        return textwrap.dedent(
            f"""\
            services:
              mysql:
                image: mysql:8.0
                ports:
                  - "3306:3306"
                environment:
                  MYSQL_ROOT_PASSWORD: lab
                  MYSQL_DATABASE: {db}
                volumes:
                  - ./seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
            """
        )
    if "clickhouse" in spec.tag:
        return textwrap.dedent(
            """\
            services:
              clickhouse:
                image: clickhouse/clickhouse-server:24.8
                ports:
                  - "8123:8123"
                  - "9000:9000"
            """
        )
    if "citus" in spec.tag:
        return textwrap.dedent(
            f"""\
            services:
              citus:
                image: citusdata/citus:12.1
                ports:
                  - "5432:5432"
                environment:
                  POSTGRES_PASSWORD: lab
                  POSTGRES_DB: {db}
                volumes:
                  - ./seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
            """
        )
    if "ch9-p0" in spec.tag or "ch9-p1" in spec.tag:
        cap = "    cap_add:\n      - NET_ADMIN\n" if spec.cap_add else ""
        return textwrap.dedent(
            f"""\
            services:
              netlab:
                image: alpine:3.20
                command: ["sleep", "infinity"]
            {cap}"""
        )
    return textwrap.dedent(
        f"""\
        services:
          postgres:
            image: postgres:16-bookworm
            environment:
              POSTGRES_PASSWORD: lab
              POSTGRES_DB: {db}
            ports:
              - "5432:5432"
            volumes:
              - ./seed.sql:/docker-entrypoint-initdb.d/01-seed.sql:ro
        """
    )


def collect_pip_packages(question: str) -> list[str]:
    pkgs: list[str] = []
    q = question.lower()
    mapping = {
        "mrjob": "mrjob==0.7.4",
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "pymongo": "pymongo",
        "redis": "redis",
        "kafka-python": "kafka-python>=2.0,<3",
        "psycopg": "psycopg[binary]>=3.1,<4",
        "pika": "pika>=1.3,<2",
        "mysql-connector": "mysql-connector-python",
    }
    for key, pkg in mapping.items():
        if key in q:
            pkgs.append(pkg)
    if "mrjob" in q:
        pkgs.append("setuptools")
    m = re.search(r"pip install\s+([^\n`]+)", question)
    if m:
        for token in re.split(r"[\s'\"]+", m.group(1)):
            token = token.strip(",")
            if token and token not in ("pip", "install") and not token.startswith("-"):
                pkgs.append(token)
    return list(dict.fromkeys(pkgs))


def collect_scaffold_files(question: str, tag: str) -> dict[str, str]:
    files: dict[str, str] = {}
    py_blocks = [b for lang, b in extract_fenced(question) if lang.lower() in ("python", "py")]
    sh_blocks = [b for lang, b in extract_fenced(question) if lang.lower() in ("bash", "sh", "shell")]
    names = re.findall(r"[Ss]ave (?:the file below as|as) `([^`]+)`", question)
    names += re.findall(r"Save `([^`]+)`", question)
    for i, name in enumerate(names):
        if name.endswith(".py") and i < len(py_blocks):
            files[name] = py_blocks[i].strip() + "\n"
        elif name.endswith(".sql") and i < len(extract_sql_blocks(question)):
            files[name] = extract_sql_blocks(question)[0].strip() + "\n"
        elif name.endswith(".sh") and sh_blocks:
            files[name] = sh_blocks[0].strip() + "\n"
    if not files and py_blocks:
        files[f"lab_{tag}.py"] = py_blocks[0].strip() + "\n"
    sql_blocks = extract_sql_blocks(question)
    if sql_blocks and "setup.sql" not in files:
        files["setup.sql"] = sql_blocks[0].strip() + "\n"
    return files


def build_specs() -> list[TaskSpec]:
    specs: list[TaskSpec] = []
    known = load_manifest_tasks()
    for filename, chapter in load_chapters():
        num = chapter["number"]
        for idx, item in enumerate(chapter.get("practice", [])):
            question = item["question"]
            task_title = item["task"]
            if not needs_docker(question, task_title):
                continue
            tag = tag_for(num, idx)
            converted = is_converted(question)
            prior = known.get(tag, {}) if converted else {}
            kind = prior.get("kind") or classify_kind(question, task_title)
            db = prior.get("db") or detect_db_name(question, task_title)
            spec = TaskSpec(
                tag=tag,
                chapter=num,
                index=idx,
                chapter_file=filename,
                kind=kind,
                base=prior.get("base") or ("pg16" if kind == "postgres-baked" else "python-lab"),
                db=db,
                port=prior.get("port", 5432 if kind == "postgres-baked" else 0),
                container_name=prior.get("containerName") or f"lab-{tag}",
                cap_add=prior.get("capAdd", []),
                converted=converted,
            )
            spec.scaffold_files = collect_scaffold_files(question, tag)
            spec.pip_packages = collect_pip_packages(question)
            if kind == "postgres-baked":
                sql_blocks = extract_sql_blocks(question)
                if sql_blocks:
                    spec.seed_sql = sql_blocks[0].strip()
                    spec.scaffold_files["setup.sql"] = sql_without_bulk_inserts(spec.seed_sql)
            elif kind in ("compose-stack", "python-lab"):
                sql_blocks = extract_sql_blocks(question)
                if sql_blocks:
                    spec.seed_sql = sql_blocks[0].strip()
                if kind == "compose-stack":
                    spec.compose_yml = compose_for(spec)
                if "ch9-p" in tag:
                    spec.cap_add = ["NET_ADMIN"]
            specs.append(spec)
    return specs


def write_task_files(spec: TaskSpec) -> None:
    if spec.kind == "postgres-baked":
        write_postgres_task(spec)
    elif spec.kind == "compose-stack":
        write_compose_task(spec)
    elif spec.kind == "python-lab":
        write_python_lab_task(spec)


def generate_bake_hcl(specs: list[TaskSpec]) -> str:
    lines = [
        'variable "REGISTRY" { default = "ghcr.io/anmisttt" }',
        'variable "BASE_PKG" { default = "ddia-practice-base" }',
        'variable "TASK_PKG" { default = "ddia-practice" }',
        'variable "TAG_SUFFIX" { default = "" }',
        "",
        'group "default" {',
        "  targets = [",
        '    "base-pg16",',
    ]
    for spec in specs:
        lines.append(f'    "task-{spec.tag}",')
    lines.extend(["  ]", "}", ""])
    lines.extend(
        [
            'target "base-pg16" {',
            '  context = "bases/pg16"',
            '  dockerfile = "Dockerfile"',
            '  tags = ["${REGISTRY}/${BASE_PKG}:pg16${TAG_SUFFIX}"]',
            "}",
            "",
        ]
    )
    for spec in specs:
        ctx = f"tasks/{spec.tag}"
        args = ""
        if spec.kind == "postgres-baked":
            args = textwrap.dedent(
                """\
                  args = {
                    BASE_IMAGE = "base"
                  }
                  contexts = {
                    base = "target:base-pg16"
                  }
                """
            )
        lines.extend(
            [
                f'target "task-{spec.tag}" {{',
                f'  context = "{ctx}"',
                '  dockerfile = "Dockerfile"',
                f'  tags = ["${{REGISTRY}}/${{TASK_PKG}}:{spec.tag}${{TAG_SUFFIX}}"]',
                args.rstrip(),
                "}",
                "",
            ]
        )
    return "\n".join(lines)


def update_chapters(specs: list[TaskSpec]) -> None:
    by_file: dict[str, list[TaskSpec]] = {}
    for spec in specs:
        by_file.setdefault(spec.chapter_file, []).append(spec)
    for filename, chapter_specs in by_file.items():
        path = DATA_DIR / filename
        chapter = json.loads(path.read_text())
        wrapper = isinstance(chapter, list)
        if wrapper:
            chapter = chapter[0]
        for spec in chapter_specs:
            if spec.converted:
                continue
            item = chapter["practice"][spec.index]
            item["question"] = rewrite_question(item["question"], spec)
        out = [chapter] if wrapper else chapter
        path.write_text(json.dumps(out if wrapper else chapter, indent=2, ensure_ascii=False) + "\n")


def write_manifest(specs: list[TaskSpec]) -> None:
    manifest = {
        "registry": REGISTRY,
        "taskPackage": TASK_PKG,
        "basePackage": BASE_PKG,
        "bases": {
            "pg16": {"path": "bases/pg16", "description": "PostgreSQL 16 with lab entrypoint"},
        },
        "tasks": {},
    }
    for spec in specs:
        entry = {
            "chapter": spec.chapter,
            "index": spec.index,
            "kind": spec.kind,
            "base": spec.base,
            "db": spec.db,
            "port": spec.port,
            "containerName": spec.container_name,
        }
        if spec.cap_add:
            entry["capAdd"] = spec.cap_add
        manifest["tasks"][spec.tag] = entry
    (SETUPS_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    COMMON_ENTRY.parent.mkdir(parents=True, exist_ok=True)
    COMMON_ENTRY.write_text((BASES_DIR / "pg16" / "lab-entrypoint.sh").read_text())
    specs = build_specs()
    TASKS_DIR.mkdir(exist_ok=True)
    for spec in specs:
        if spec.converted and (TASKS_DIR / spec.tag).exists():
            continue
        write_task_files(spec)
    write_manifest(specs)
    (SETUPS_DIR / "docker-bake.hcl").write_text(generate_bake_hcl(specs) + "\n")
    update_chapters(specs)
    print(f"Generated {len(specs)} task setups")


if __name__ == "__main__":
    main()
