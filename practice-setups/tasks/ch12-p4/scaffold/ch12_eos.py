#!/usr/bin/env python3
"""ch12_eos.py — Kafka at-least-once redelivery vs offset-guarded Postgres upserts."""
from __future__ import annotations

import json
import sys
import time

import psycopg
from kafka import KafkaAdminClient, KafkaConsumer, KafkaProducer, TopicPartition
from kafka.admin import NewTopic
from kafka.errors import TopicAlreadyExistsError, UnknownTopicOrPartitionError

BOOTSTRAP = "localhost:9092"
TOPIC = "ch12.credits"
GROUP = "ledger"
PARTITIONS = 1
DB = "host=localhost port=5433 dbname=ch12_eos_lab user=postgres password=postgres"


def ensure_topic() -> None:
    admin = KafkaAdminClient(bootstrap_servers=BOOTSTRAP, client_id="ch12-eos-admin")
    try:
        try:
            admin.delete_topics([TOPIC])
            time.sleep(2.0)
        except UnknownTopicOrPartitionError:
            pass
        try:
            admin.delete_consumer_groups([GROUP])
            time.sleep(1.0)
        except Exception:
            pass
        try:
            admin.create_topics(
                [NewTopic(name=TOPIC, num_partitions=PARTITIONS, replication_factor=1)]
            )
            time.sleep(1.0)
        except TopicAlreadyExistsError:
            pass
    finally:
        admin.close()


def seed_events() -> None:
    """Append credit events: alice +100, +50, +25."""
    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP,
        acks="all",
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    for delta in (100, 50, 25):
        producer.send(TOPIC, value={"account_id": "alice", "delta_cents": delta})
    producer.flush()
    producer.close()


def reset_sink() -> None:
    with psycopg.connect(DB) as conn:
        conn.execute(
            "UPDATE eos.accounts SET balance_cents = 0, last_offset = -1 "
            "WHERE account_id = 'alice'"
        )
        conn.commit()


def balance() -> int:
    with psycopg.connect(DB) as conn:
        row = conn.execute(
            "SELECT balance_cents FROM eos.accounts WHERE account_id = 'alice'"
        ).fetchone()
        return int(row[0])


def _join_consumer() -> KafkaConsumer:
    consumer = KafkaConsumer(
        bootstrap_servers=BOOTSTRAP,
        group_id=GROUP,
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
    )
    consumer.subscribe([TOPIC])
    deadline = time.time() + 20.0
    while not consumer.assignment() and time.time() < deadline:
        consumer.poll(timeout_ms=200)
    if not consumer.assignment():
        consumer.close()
        raise RuntimeError("timed out waiting for partition assignment")
    # Assignment polls can advance the local position past the committed offset.
    # Always re-seek to committed (or earliest if none) before reading.
    for tp in consumer.assignment():
        committed = consumer.committed(tp)
        if committed is None:
            consumer.seek(tp, consumer.beginning_offsets([tp])[tp])
        else:
            consumer.seek(tp, committed)
    consumer.poll(timeout_ms=0)  # clear any pre-seek fetch buffer
    return consumer


def consume_naive(idle_ms: int = 1500) -> int:
    """Always apply delta; commit Kafka offset after each message (at-least-once)."""
    consumer = _join_consumer()
    n = 0
    idle_deadline = None
    while True:
        batch = consumer.poll(timeout_ms=400)
        if not batch:
            if idle_deadline is None:
                idle_deadline = time.time() + idle_ms / 1000.0
            elif time.time() >= idle_deadline:
                break
            continue
        idle_deadline = None
        for _tp, msgs in batch.items():
            for msg in msgs:
                ev = msg.value
                with psycopg.connect(DB) as conn:
                    conn.execute(
                        "UPDATE eos.accounts SET balance_cents = balance_cents + %s "
                        "WHERE account_id = %s",
                        (ev["delta_cents"], ev["account_id"]),
                    )
                    conn.commit()
                # Commit after the side effect — a crash here loses the ack.
                consumer.commit()
                n += 1
    consumer.close()
    return n


def simulate_lost_ack() -> None:
    """Rewind the consumer group to the start of the topic without undoing DB updates."""
    meta = KafkaConsumer(bootstrap_servers=BOOTSTRAP)
    parts = meta.partitions_for_topic(TOPIC) or set()
    meta.close()
    tps = [TopicPartition(TOPIC, p) for p in sorted(parts)]
    consumer = KafkaConsumer(
        bootstrap_servers=BOOTSTRAP,
        group_id=GROUP,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
    )
    consumer.assign(tps)
    begins = consumer.beginning_offsets(tps)
    for tp in tps:
        consumer.seek(tp, begins[tp])
    consumer.commit()
    consumer.close()


def consume_idempotent(idle_ms: int = 1500) -> int:
    """Apply only if accounts.last_offset < msg.offset; store offset; then commit Kafka."""
    # implement:
    # - join via _join_consumer(); poll until idle
    # - for each message: UPDATE eos.accounts
    #     SET balance_cents = balance_cents + delta, last_offset = msg.offset
    #     WHERE account_id = ... AND last_offset < msg.offset
    # - then consumer.commit(); count every scanned message (including no-op updates)
    # - close and return the scan count
    raise NotImplementedError


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "reset":
        ensure_topic()
        seed_events()
        reset_sink()
        print("reset: topic seeded, alice balance=0")
        return

    if cmd == "naive":
        n = consume_naive()
        print(f"naive_scanned={n} balance={balance()}")
        return

    if cmd == "lost-ack":
        simulate_lost_ack()
        print("rewound consumer group to earliest")
        return

    if cmd == "idempotent":
        n = consume_idempotent()
        print(f"idempotent_scanned={n} balance={balance()}")
        return

    if cmd == "balance":
        print(f"balance={balance()}")
        return

    if cmd == "demo":
        # Full path used after you implement consume_idempotent
        ensure_topic()
        seed_events()
        reset_sink()

        consume_naive()
        print(f"after_naive={balance()}")  # 175

        simulate_lost_ack()
        consume_naive()
        print(f"after_redelivery_naive={balance()}")  # 350

        reset_sink()
        simulate_lost_ack()
        consume_idempotent()
        print(f"after_idempotent={balance()}")  # 175
        simulate_lost_ack()
        consume_idempotent()
        print(f"after_redelivery_idempotent={balance()}")  # 175
        return

    print(
        "usage: python3 ch12_eos.py [reset|naive|lost-ack|idempotent|balance|demo]",
        file=sys.stderr,
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
