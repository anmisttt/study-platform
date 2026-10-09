#!/usr/bin/env python3
"""ch12_backpressure.py — RabbitMQ bounded queue with produce-side backpressure."""
from __future__ import annotations

import os
import sys

import pika
from pika.exceptions import NackError

HOST = os.environ.get("RABBITMQ_HOST", "localhost")
PORT = 5672
MAX_DEPTH = 5

Q_BOUNDED = "bp.bounded"
Q_DROP = "bp.drop_head"
Q_UNBOUNDED = "bp.unbounded"


class BackpressureError(Exception):
    pass


def connect() -> pika.BlockingConnection:
    return pika.BlockingConnection(
        pika.ConnectionParameters(host=HOST, port=PORT, heartbeat=30)
    )


def open_channel(
    conn: pika.BlockingConnection,
) -> pika.adapters.blocking_connection.BlockingChannel:
    """Open a channel configured for confirmed publishing."""
    ch = conn.channel()
    ch.confirm_delivery()
    return ch


def reset_queues(ch: pika.adapters.blocking_connection.BlockingChannel) -> None:
    """Delete and redeclare the three lab queues (idempotent lab reset)."""
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

    ch.queue_declare(
        queue=Q_BOUNDED,
        arguments={
            "x-max-length": MAX_DEPTH,
            "x-overflow": "reject-publish",
        },
    )

    ch.queue_declare(
        queue=Q_DROP,
        arguments={
            "x-max-length": MAX_DEPTH,
            "x-overflow": "drop-head",
        },
    )

    ch.queue_declare(queue=Q_UNBOUNDED)


def depth(ch: pika.adapters.blocking_connection.BlockingChannel, queue: str) -> int:
    return ch.queue_declare(queue=queue, passive=True).method.message_count


def produce(
    ch: pika.adapters.blocking_connection.BlockingChannel,
    queue: str,
    payload: str,
) -> None:
    """Publish one payload."""
    # TODO: publish with confirms
    raise NotImplementedError


def consume_one(
    ch: pika.adapters.blocking_connection.BlockingChannel,
    queue: str,
) -> str | None:
    """Consume one available message."""
    # TODO: get and acknowledge one message
    raise NotImplementedError


def fill(ch, queue: str, n: int, prefix: str = "m") -> None:
    for i in range(1, n + 1):
        produce(ch, queue, f"{prefix}{i}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    conn = connect()
    ch = open_channel(conn)

    if cmd == "reset":
        reset_queues(ch)
        print("queues reset")
        conn.close()
        return

    if cmd == "demo":
        reset_queues(ch)

        fill(ch, Q_BOUNDED, MAX_DEPTH)
        print(f"bounded depth after fill={depth(ch, Q_BOUNDED)}")

        try:
            produce(ch, Q_BOUNDED, "overflow")
            print("ERROR: expected BackpressureError")
        except BackpressureError as e:
            print(f"overflow: {e}")
        print(f"bounded depth after reject={depth(ch, Q_BOUNDED)}")

        print(f"consumed={consume_one(ch, Q_BOUNDED)}")
        produce(ch, Q_BOUNDED, "m6")
        print(f"bounded depth after drain+produce={depth(ch, Q_BOUNDED)}")

        fill(ch, Q_DROP, MAX_DEPTH, prefix="d")
        produce(ch, Q_DROP, "d_new")
        print(f"drop_head depth={depth(ch, Q_DROP)}")
        first = consume_one(ch, Q_DROP)
        print(f"drop_head oldest_now={first}")

        fill(ch, Q_UNBOUNDED, 20, prefix="u")
        print(f"unbounded depth={depth(ch, Q_UNBOUNDED)}")

        conn.close()
        return

    print("usage: python3 ch12_backpressure.py [reset|demo]", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
