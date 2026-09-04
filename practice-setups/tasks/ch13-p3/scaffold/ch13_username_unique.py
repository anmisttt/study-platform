#!/usr/bin/env python3
"""ch13_username_unique.py — uniqueness via Kafka key=username ordered log."""
from __future__ import annotations

import json
import sys
import time
from typing import Any

from kafka import KafkaAdminClient, KafkaConsumer, KafkaProducer
from kafka.admin import NewTopic
from kafka.errors import TopicAlreadyExistsError

BOOTSTRAP = "localhost:9092"
TOPIC_CLAIMS = "uname.claims"
TOPIC_DECISIONS = "uname.decisions"
PARTITIONS = 3


def ensure_topics() -> None:
    admin = KafkaAdminClient(bootstrap_servers=BOOTSTRAP, client_id="ch13-uname-admin")
    topics = [
        NewTopic(TOPIC_CLAIMS, num_partitions=PARTITIONS, replication_factor=1),
        NewTopic(TOPIC_DECISIONS, num_partitions=PARTITIONS, replication_factor=1),
    ]
    try:
        admin.create_topics(topics)
    except TopicAlreadyExistsError:
        pass
    admin.close()


def publish_claims(claims: list[tuple[str, str]]) -> None:
    """claims: list of (request_id, username). Key MUST be username for co-location."""
    p = KafkaProducer(
        bootstrap_servers=BOOTSTRAP,
        key_serializer=lambda k: k.encode(),
        value_serializer=lambda v: json.dumps(v).encode(),
        acks="all",
    )
    for request_id, username in claims:
        p.send(
            TOPIC_CLAIMS,
            key=username,
            value={"request_id": request_id, "username": username},
        )
    p.flush()
    p.close()


def decide(taken: dict[str, str], claim: dict[str, Any]) -> dict[str, Any]:
    """First claim for a username wins; later claims are rejected."""
    # implement:
    # - if username in taken: status rejected
    # - else: taken[username] = request_id; status accepted
    # - return {request_id, username, status}
    raise NotImplementedError


def run_enforcer(expected: int = 5, timeout_s: float = 20.0) -> list[dict[str, Any]]:
    """
    Consume TOPIC_CLAIMS in log order per partition, emit decisions to TOPIC_DECISIONS.
    Maintain local `taken` map (production: state store / local DB per shard).
    """
    # implement:
    # - consumer group_id unique per run, auto_offset_reset earliest
    # - producer for TOPIC_DECISIONS keyed by username
    # - for each claim: decision = decide(taken, value); send to TOPIC_DECISIONS
    # - collect `expected` decisions then return them
    raise NotImplementedError


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "demo":
        ensure_topics()
        admin = KafkaAdminClient(bootstrap_servers=BOOTSTRAP, client_id="ch13-uname-reset")
        try:
            admin.delete_topics([TOPIC_CLAIMS, TOPIC_DECISIONS])
            time.sleep(2)
        except Exception:
            pass
        admin.close()
        ensure_topics()
        publish_claims(
            [
                ("r1", "neo"),
                ("r2", "trinity"),
                ("r3", "neo"),
                ("r4", "morpheus"),
                ("r5", "trinity"),
            ]
        )
        time.sleep(1)
        decisions = run_enforcer(expected=5)
        for d in sorted(decisions, key=lambda x: x["request_id"]):
            print(f"{d['request_id']} {d['username']} {d['status']}")
        # expect: r1 neo accepted; r2 trinity accepted; r3 neo rejected;
        #         r4 morpheus accepted; r5 trinity rejected
        return
    print("usage: python3 ch13_username_unique.py demo", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
