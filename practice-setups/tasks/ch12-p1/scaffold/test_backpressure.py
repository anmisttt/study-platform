#!/usr/bin/env python3
from ch12_backpressure import (
    MAX_DEPTH,
    Q_BOUNDED,
    Q_DROP,
    Q_UNBOUNDED,
    BackpressureError,
    connect,
    consume_one,
    depth,
    fill,
    open_channel,
    produce,
    reset_queues,
)


def main() -> None:
    conn = connect()
    ch = open_channel(conn)
    try:
        reset_queues(ch)

        assert consume_one(ch, Q_BOUNDED) is None
        produce(ch, Q_BOUNDED, "Zażółć gęślą 🐇")
        assert consume_one(ch, Q_BOUNDED) == "Zażółć gęślą 🐇"
        assert consume_one(ch, Q_BOUNDED) is None

        produce(ch, Q_BOUNDED, "acked")
        assert consume_one(ch, Q_BOUNDED) == "acked"
        ch.close()
        ch = open_channel(conn)
        assert consume_one(ch, Q_BOUNDED) is None

        fill(ch, Q_BOUNDED, MAX_DEPTH)
        assert depth(ch, Q_BOUNDED) == MAX_DEPTH
        try:
            produce(ch, Q_BOUNDED, "overflow")
        except BackpressureError as exc:
            assert str(exc) == "backpressure: queue full"
        else:
            raise AssertionError("bounded queue accepted an overflow publish")
        assert depth(ch, Q_BOUNDED) == MAX_DEPTH
        assert consume_one(ch, Q_BOUNDED) == "m1"
        produce(ch, Q_BOUNDED, "m6")
        assert depth(ch, Q_BOUNDED) == MAX_DEPTH

        fill(ch, Q_DROP, MAX_DEPTH, prefix="d")
        produce(ch, Q_DROP, "d_new")
        assert depth(ch, Q_DROP) == MAX_DEPTH
        assert consume_one(ch, Q_DROP) == "d2"

        fill(ch, Q_UNBOUNDED, 20, prefix="u")
        assert depth(ch, Q_UNBOUNDED) == 20
    finally:
        conn.close()

    print("all backpressure checks passed")


if __name__ == "__main__":
    main()
