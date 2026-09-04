#!/usr/bin/env python3
"""ch12_backpressure.py — RabbitMQ bounded queue with produce-side backpressure."""
from __future__ import annotations

import sys

import pika
from pika.exceptions import NackError

HOST = "localhost"
PORT = 5672
MAX_DEPTH = 5

# Three queues: refuse-on-full, drop oldest, unbounded buffer
Q_BOUNDED = "bp.bounded"
Q_DROP = "bp.drop_head"
Q_UNBOUNDED = "bp.unbounded"


class BackpressureError(Exception):
    """Raised when the broker nacks a publish because the bounded queue is full."""


def connect() -> pika.BlockingConnection:
    return pika.BlockingConnection(
        pika.ConnectionParameters(host=HOST, port=PORT, heartbeat=30)
    )


def reset_queues(ch: pika.adapters.blocking_connection.BlockingChannel) -> None:
    """Delete and redeclare the three lab queues (idempotent lab reset)."""
    # Declare with the same arguments as the final lab declare before delete.
    # A bare queue_declare on an existing bounded/drop-head queue raises
    # 406 PRECONDITION_FAILED and closes the channel; delete of a missing
    # queue raises 404 and also closes the channel.
    ch.queue_declare(
        queue=Q_BOUNDED,
        arguments={
            "x-max-length": MAX_DEPTH,
            "x-overflow": "reject-publish",
        },
    )
    ch.queue_delete(queue=Q_BOUNDED)

    ch.queue_declare(
        queue=Q_DROP,
        arguments={
            "x-max-length": MAX_DEPTH,
            "x-overflow": "drop-head",
        },
    )
    ch.queue_delete(queue=Q_DROP)

    ch.queue_declare(queue=Q_UNBOUNDED)
    ch.queue_delete(queue=Q_UNBOUNDED)

    # Bounded: refuse new publishes when full (admission-control backpressure).
    # Publisher confirms are required so the client sees basic.nack.
    ch.queue_declare(
        queue=Q_BOUNDED,
        arguments={
            "x-max-length": MAX_DEPTH,
            "x-overflow": "reject-publish",
        },
    )

    # Same capacity, but default overflow drops the oldest ready message.
    ch.queue_declare(
        queue=Q_DROP,
        arguments={
            "x-max-length": MAX_DEPTH,
            "x-overflow": "drop-head",
        },
    )

    # No length limit — hides a slow consumer until memory/disk hurts.
    ch.queue_declare(queue=Q_UNBOUNDED)


def depth(ch: pika.adapters.blocking_connection.BlockingChannel, queue: str) -> int:
    return ch.queue_declare(queue=queue, passive=True).method.message_count


def produce(
    ch: pika.adapters.blocking_connection.BlockingChannel,
    queue: str,
    payload: str,
) -> None:
    """Publish with publisher confirms. On Q_BOUNDED full, raise BackpressureError."""
    # implement:
    # - ch.confirm_delivery() once before publishing on this channel
    # - basic_publish to exchange="" routing_key=queue body=payload.encode()
    # - if the broker nacks (NackError), raise BackpressureError("backpressure: queue full")
    # - other queues should not raise on overflow (drop-head silently drops; unbounded grows)
    raise NotImplementedError


def consume_one(
    ch: pika.adapters.blocking_connection.BlockingChannel,
    queue: str,
) -> str | None:
    """Pull one message with basic_get, ack it, return payload text; None if empty."""
    # implement:
    # - method, props, body = ch.basic_get(queue=queue, auto_ack=False)
    # - if method is None: return None
    # - ch.basic_ack(delivery_tag=method.delivery_tag); return body.decode()
    raise NotImplementedError


def fill(ch, queue: str, n: int, prefix: str = "m") -> None:
    for i in range(1, n + 1):
        produce(ch, queue, f"{prefix}{i}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    conn = connect()
    ch = conn.channel()

    if cmd == "reset":
        reset_queues(ch)
        print("queues reset")
        conn.close()
        return

    if cmd == "demo":
        reset_queues(ch)

        # 1–2: fill bounded to capacity
        fill(ch, Q_BOUNDED, MAX_DEPTH)
        print(f"bounded depth after fill={depth(ch, Q_BOUNDED)}")  # expect 5

        # 3: overflow must fail fast
        try:
            produce(ch, Q_BOUNDED, "overflow")
            print("ERROR: expected BackpressureError")
        except BackpressureError as e:
            print(f"overflow: {e}")
        print(f"bounded depth after reject={depth(ch, Q_BOUNDED)}")  # still 5

        # 4: consume one slot, then produce succeeds
        print(f"consumed={consume_one(ch, Q_BOUNDED)}")
        produce(ch, Q_BOUNDED, "m6")
        print(f"bounded depth after drain+produce={depth(ch, Q_BOUNDED)}")  # 5

        # Contrast A: drop-head — 6th publish succeeds; oldest is discarded
        fill(ch, Q_DROP, MAX_DEPTH, prefix="d")
        produce(ch, Q_DROP, "d_new")
        print(f"drop_head depth={depth(ch, Q_DROP)}")  # still 5
        first = consume_one(ch, Q_DROP)
        print(f"drop_head oldest_now={first}")  # expect d2 (d1 was dropped)

        # Contrast B: unbounded — 20 publishes, depth grows
        fill(ch, Q_UNBOUNDED, 20, prefix="u")
        print(f"unbounded depth={depth(ch, Q_UNBOUNDED)}")  # 20

        conn.close()
        return

    print("usage: python3 ch12_backpressure.py [reset|demo]", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
