#!/usr/bin/env python3
"""ch13_fx_join.py — Kafka stream–table join: rates KTable × purchases KStream."""
from __future__ import annotations

import json
import sys
import time
from typing import Any

from kafka import KafkaAdminClient, KafkaConsumer, KafkaProducer
from kafka.admin import NewTopic
from kafka.errors import TopicAlreadyExistsError

BOOTSTRAP = "localhost:9092"
TOPIC_RATES = "fx.rates"
TOPIC_PURCHASES = "fx.purchases"
TOPIC_OUT = "fx.purchase_usd"


def producer() -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=BOOTSTRAP,
        key_serializer=lambda k: k.encode("utf-8") if k is not None else None,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        acks="all",
    )


def ensure_topics() -> None:
    admin = KafkaAdminClient(bootstrap_servers=BOOTSTRAP, client_id="ch13-fx-admin")
    topics = [
        NewTopic(TOPIC_RATES, num_partitions=1, replication_factor=1),
        NewTopic(TOPIC_PURCHASES, num_partitions=1, replication_factor=1),
        NewTopic(TOPIC_OUT, num_partitions=1, replication_factor=1),
    ]
    try:
        admin.create_topics(topics, validate_only=False)
    except TopicAlreadyExistsError:
        pass
    admin.close()


def seed_events(p: KafkaProducer) -> None:
    """Publish rate updates then purchases (keys matter for co-partitioning in production)."""
    rates = [
        {"currency": "EUR", "usd_per_unit": 1.10, "effective_at": "2024-06-01T09:00:00Z"},
        {"currency": "GBP", "usd_per_unit": 1.25, "effective_at": "2024-06-01T09:00:00Z"},
        {"currency": "EUR", "usd_per_unit": 1.12, "effective_at": "2024-06-01T10:00:00Z"},
    ]
    for r in rates:
        p.send(TOPIC_RATES, key=r["currency"], value=r)
    purchases = [
        {"purchase_id": "p1", "currency": "EUR", "amount": 100.00, "purchased_at": "2024-06-01T09:30:00Z"},
        {"purchase_id": "p2", "currency": "GBP", "amount": 40.00, "purchased_at": "2024-06-01T09:45:00Z"},
        {"purchase_id": "p3", "currency": "EUR", "amount": 50.00, "purchased_at": "2024-06-01T10:15:00Z"},
    ]
    for buy in purchases:
        p.send(TOPIC_PURCHASES, key=buy["purchase_id"], value=buy)
    p.flush()


def apply_rate(local_rates: dict[str, dict[str, Any]], event: dict[str, Any]) -> None:
    """Upsert the local rate table (in-memory KTable stand-in)."""
    # implement: local_rates[event["currency"]] = event
    raise NotImplementedError


def enrich_purchase(
    local_rates: dict[str, dict[str, Any]], purchase: dict[str, Any]
) -> dict[str, Any]:
    """Stream–table join: attach the current local rate and compute usd_amount."""
    # implement:
    # - look up purchase["currency"] in local_rates; raise KeyError if missing
    # - usd_amount = round(amount * usd_per_unit, 2)
    # - return dict with purchase_id, currency, amount, usd_amount, rate_used, rate_at, purchased_at
    raise NotImplementedError


def run_join(max_out: int = 3, timeout_s: float = 20.0) -> list[dict[str, Any]]:
    """
    Consume rates + purchases (subscribe to both topics), maintain local_rates,
    emit enriched purchases to TOPIC_OUT. Return up to max_out enriched records.
    """
    # implement:
    # - consumer on [TOPIC_RATES, TOPIC_PURCHASES],
    #   group_id unique per run (e.g. f"fx-joiner-{time.time_ns()}"),
    #   auto_offset_reset="earliest", enable_auto_commit=True,
    #   value_deserializer=json loads, key_deserializer=utf-8
    # - out = producer(); local_rates = {}; pending = []; results = []
    # - loop until len(results) >= max_out or timeout — single poll only (no nested polls):
    #     poll once; first apply every TOPIC_RATES record in the batch
    #     buffer every TOPIC_PURCHASES record (never drop purchases from a poll)
    #     wait until fx.rates partitions are at broker end offsets (seeded EUR
    #       history lands at 1.12) before enriching any purchase
    #     then enrich pending purchases whose currency is in local_rates;
    #       out.send(TOPIC_OUT, ...); results.append(...)
    # - flush/close; return results
    raise NotImplementedError


def read_output(n: int = 3, timeout_s: float = 10.0) -> list[dict[str, Any]]:
    c = KafkaConsumer(
        TOPIC_OUT,
        bootstrap_servers=BOOTSTRAP,
        group_id=f"fx-out-reader-{time.time_ns()}",
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        consumer_timeout_ms=int(timeout_s * 1000),
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
        key_deserializer=lambda b: b.decode("utf-8") if b else None,
    )
    rows = []
    for msg in c:
        rows.append(msg.value)
        if len(rows) >= n:
            break
    c.close()
    return rows


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "seed":
        ensure_topics()
        p = producer()
        seed_events(p)
        p.close()
        print("seeded rates + purchases")
        return
    if cmd == "demo":
        ensure_topics()
        # reset lab topics for a clean demo
        admin = KafkaAdminClient(bootstrap_servers=BOOTSTRAP, client_id="ch13-fx-reset")
        try:
            admin.delete_topics([TOPIC_RATES, TOPIC_PURCHASES, TOPIC_OUT])
            time.sleep(2)
        except Exception:
            pass
        admin.close()
        ensure_topics()
        p = producer()
        seed_events(p)
        p.close()
        time.sleep(1)
        results = run_join(max_out=3)
        for r in sorted(results, key=lambda x: x["purchase_id"]):
            print(
                f"{r['purchase_id']} usd={r['usd_amount']:.2f} rate={r['rate_used']}"
            )
        # expect p1 usd=112.00 rate=1.12; p2 50.00 / 1.25; p3 56.00 / 1.12
        return
    if cmd == "replay-trap":
        # After demo rates are applied, publish a new EUR rate and re-seed purchases
        # with a fresh joiner group to show time-dependence of "latest local rate".
        ensure_topics()
        p = producer()
        p.send(
            TOPIC_RATES,
            key="EUR",
            value={
                "currency": "EUR",
                "usd_per_unit": 1.50,
                "effective_at": "2024-06-01T11:00:00Z",
            },
        )
        for buy in [
            {"purchase_id": "p1", "currency": "EUR", "amount": 100.00, "purchased_at": "2024-06-01T09:30:00Z"},
            {"purchase_id": "p3", "currency": "EUR", "amount": 50.00, "purchased_at": "2024-06-01T10:15:00Z"},
        ]:
            p.send(TOPIC_PURCHASES, key=buy["purchase_id"], value=buy)
        p.flush()
        p.close()
        # run_join already uses a unique group_id per call; re-run the joiner
        # (or call run_join again) to see purchases enrich against EUR=1.50.
        print("published EUR=1.50 and replay purchases; run a joiner with a new group_id")
        return
    print("usage: python3 ch13_fx_join.py [seed|demo|replay-trap]", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
