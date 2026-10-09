#!/usr/bin/env python3
import time

import psycopg

from ch13_idempotent_transfer import (
    DSN,
    apply_idempotent,
    balances,
    consume_once,
    publish,
    reset_db,
    reset_topic,
)


reset_topic()
reset_db()
request_id = "duplicate-transfer-test"
event = {
    "request_id": request_id,
    "from_account": "alice",
    "to_account": "bob",
    "amount_cents": 1100,
}

with psycopg.connect(DSN) as conn:
    assert apply_idempotent(conn, event) == "applied"
with psycopg.connect(DSN) as conn:
    assert apply_idempotent(conn, event) == "duplicate"
assert balances() == {"alice": 8900, "bob": 1100}

reset_db()
publish(request_id, "alice", "bob", 1100)
publish(request_id, "alice", "bob", 1100)
group = f"xfer-test-{time.time_ns()}"
assert consume_once("idempotent", group) == "applied"
assert consume_once("idempotent", group) == "duplicate"
assert balances() == {"alice": 8900, "bob": 1100}

with psycopg.connect(DSN) as conn:
    count = conn.execute("SELECT count(*) FROM xfer.requests").fetchone()[0]
assert count == 1

print("idempotent transfer tests passed")
