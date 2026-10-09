#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
import uuid

import psycopg
from kafka import KafkaAdminClient, KafkaConsumer, KafkaProducer
from kafka.admin import NewTopic
from kafka.errors import TopicAlreadyExistsError

BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:29092")
TOPIC = "xfer.requests"
DSN = os.environ.get(
    "POSTGRES_DSN",
    "host=postgres port=5432 dbname=ch13_idem_lab user=postgres password=postgres",
)


def ensure_topic() -> None:
    admin = KafkaAdminClient(bootstrap_servers=BOOTSTRAP, client_id="xfer-admin")
    try:
        admin.create_topics([NewTopic(TOPIC, num_partitions=1, replication_factor=1)])
    except TopicAlreadyExistsError:
        pass
    finally:
        admin.close()


def reset_topic() -> None:
    admin = KafkaAdminClient(bootstrap_servers=BOOTSTRAP, client_id="xfer-reset")
    try:
        try:
            admin.delete_topics([TOPIC])
            time.sleep(2)
        except Exception:
            pass
    finally:
        admin.close()
    ensure_topic()


def publish(request_id: str, frm: str, to: str, amount: int) -> None:
    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP,
        key_serializer=lambda value: value.encode("utf-8"),
        value_serializer=lambda value: json.dumps(value).encode("utf-8"),
        acks="all",
    )
    producer.send(
        TOPIC,
        key=request_id,
        value={
            "request_id": request_id,
            "from_account": frm,
            "to_account": to,
            "amount_cents": amount,
        },
    )
    producer.flush()
    producer.close()


def apply_naive(conn: psycopg.Connection, event: dict) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE xfer.accounts
            SET balance_cents = balance_cents - %s
            WHERE account_id = %s AND balance_cents >= %s
            """,
            (event["amount_cents"], event["from_account"], event["amount_cents"]),
        )
        if cur.rowcount != 1:
            raise RuntimeError("debit failed")
        cur.execute(
            "UPDATE xfer.accounts SET balance_cents = balance_cents + %s WHERE account_id = %s",
            (event["amount_cents"], event["to_account"]),
        )
        if cur.rowcount != 1:
            raise RuntimeError("credit failed")
    conn.commit()
    return "applied"


def apply_idempotent(conn: psycopg.Connection, event: dict) -> str:
    # TODO: idempotent transfer transaction
    raise NotImplementedError


def consume_once(handler_name: str, group_id: str) -> str:
    # TODO: consume and commit one transfer
    raise NotImplementedError


def reset_db() -> None:
    with psycopg.connect(DSN) as conn:
        conn.execute(
            "UPDATE xfer.accounts SET balance_cents = 10000 WHERE account_id = 'alice'"
        )
        conn.execute(
            "UPDATE xfer.accounts SET balance_cents = 0 WHERE account_id = 'bob'"
        )
        conn.execute("TRUNCATE xfer.requests")
        conn.commit()


def balances() -> dict[str, int]:
    with psycopg.connect(DSN) as conn:
        rows = conn.execute(
            "SELECT account_id, balance_cents FROM xfer.accounts ORDER BY account_id"
        ).fetchall()
    return {account_id: balance for account_id, balance in rows}


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    ensure_topic()
    if cmd == "reset-db":
        reset_db()
        print("db reset", balances())
        return
    if cmd == "reset-topic":
        reset_topic()
        print("topic reset")
        return
    if cmd == "publish":
        request_id = sys.argv[2] if len(sys.argv) > 2 else str(uuid.uuid4())
        publish(request_id, "alice", "bob", 1100)
        print(f"published request_id={request_id}")
        return
    if cmd == "consume-naive":
        group = sys.argv[2] if len(sys.argv) > 2 else f"xfer-naive-{time.time_ns()}"
        print(consume_once("naive", group))
        print(balances())
        return
    if cmd == "consume-idempotent":
        group = sys.argv[2] if len(sys.argv) > 2 else f"xfer-idem-{time.time_ns()}"
        print(consume_once("idempotent", group))
        print(balances())
        return
    print(
        "usage: reset-db | reset-topic | publish [request_id] | "
        "consume-naive [group] | consume-idempotent [group]",
        file=sys.stderr,
    )
    raise SystemExit(2)


if __name__ == "__main__":
    main()
