#!/usr/bin/env python3
import subprocess
import sys

import psycopg
from kafka import KafkaConsumer, TopicPartition

import ch12_eos as lab
from ch12_eos import (
    BOOTSTRAP,
    DB,
    GROUP,
    TOPIC,
    balance,
    consume_idempotent,
    consume_naive,
    ensure_topic,
    reset_sink,
    seed_events,
    simulate_lost_ack,
)


class CloseTrackingConsumer:
    def __init__(self, consumer):
        self.consumer = consumer
        self.closed = False

    def __getattr__(self, name):
        return getattr(self.consumer, name)

    def close(self):
        self.consumer.close()
        self.closed = True


def sink_state() -> tuple[int, int]:
    with psycopg.connect(DB) as conn:
        row = conn.execute(
            "SELECT balance_cents, last_offset FROM eos.accounts "
            "WHERE account_id = 'alice'"
        ).fetchone()
        return int(row[0]), int(row[1])


def committed_offset() -> int | None:
    consumer = KafkaConsumer(
        bootstrap_servers=BOOTSTRAP,
        group_id=GROUP,
        enable_auto_commit=False,
    )
    try:
        return consumer.committed(TopicPartition(TOPIC, 0))
    finally:
        consumer.close()


ensure_topic()
seed_events()
reset_sink()

assert consume_naive() == 3
assert balance() == 175
simulate_lost_ack()
assert consume_naive() == 3
assert balance() == 350

reset_sink()
simulate_lost_ack()
original_join_consumer = lab._join_consumer
tracked_consumers = []


def tracked_join_consumer():
    consumer = CloseTrackingConsumer(original_join_consumer())
    tracked_consumers.append(consumer)
    return consumer


lab._join_consumer = tracked_join_consumer
with psycopg.connect(DB) as conn:
    conn.execute(
        "ALTER TABLE eos.accounts DROP CONSTRAINT IF EXISTS verify_fail_after_first"
    )
    conn.execute(
        "ALTER TABLE eos.accounts ADD CONSTRAINT verify_fail_after_first "
        "CHECK (balance_cents <= 100)"
    )
try:
    consume_idempotent()
except Exception as exc:
    database_failure = exc
else:
    raise AssertionError("expected the second database transaction to fail")
finally:
    lab._join_consumer = original_join_consumer
    with psycopg.connect(DB) as conn:
        conn.execute(
            "ALTER TABLE eos.accounts DROP CONSTRAINT verify_fail_after_first"
        )

assert isinstance(database_failure, psycopg.Error)
assert len(tracked_consumers) == 1 and tracked_consumers[0].closed
assert sink_state() == (100, 0)
assert committed_offset() == 1
assert consume_idempotent() == 2
assert sink_state() == (175, 2)
assert consume_idempotent() == 0
assert balance() == 175
simulate_lost_ack()
redelivery = subprocess.run(
    [sys.executable, "ch12_eos.py", "idempotent"],
    check=True,
    capture_output=True,
    text=True,
)
assert redelivery.stdout.strip() == "idempotent_scanned=3 balance=175"
assert sink_state() == (175, 2)

print("verification passed")
