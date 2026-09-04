#!/usr/bin/env python3
"""ch12_log_queue.py — Kafka log-based topic: lag, fan-out groups, replay."""
from __future__ import annotations

import sys
import time
from typing import Iterable

from kafka import KafkaAdminClient, KafkaConsumer, KafkaProducer, TopicPartition
from kafka.admin import NewTopic
from kafka.errors import TopicAlreadyExistsError, UnknownTopicOrPartitionError

BOOTSTRAP = "localhost:9092"
TOPIC = "ch12.events"
PARTITIONS = 1
GROUP_ANALYTICS = "analytics"
GROUP_INDEXER = "indexer"


def ensure_topic() -> None:
    admin = KafkaAdminClient(bootstrap_servers=BOOTSTRAP, client_id="ch12-admin")
    try:
        try:
            admin.delete_topics([TOPIC])
            time.sleep(2.0)
        except UnknownTopicOrPartitionError:
            pass
        try:
            admin.delete_consumer_groups([GROUP_ANALYTICS, GROUP_INDEXER])
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


def produce_all(payloads: Iterable[str]) -> int:
    """Append payloads to TOPIC; return count written. Never refuse for consumer lag."""
    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP,
        acks="all",
        key_serializer=lambda k: k.encode("utf-8") if k is not None else None,
        value_serializer=lambda v: v.encode("utf-8"),
    )
    n = 0
    for payload in payloads:
        # single partition + constant key keeps total order for the lab
        producer.send(TOPIC, key="k", value=payload)
        n += 1
    producer.flush()
    producer.close()
    return n


def _consumer(group_id: str) -> KafkaConsumer:
    return KafkaConsumer(
        bootstrap_servers=BOOTSTRAP,
        group_id=group_id,
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        key_deserializer=lambda b: b.decode("utf-8") if b else None,
        value_deserializer=lambda b: b.decode("utf-8"),
    )


def drain_group(group_id: str, idle_ms: int = 1500) -> list[str]:
    """Subscribe as group_id; read until idle; commit; return payloads in order."""
    # implement:
    # - subscribe to TOPIC; poll until assignment is non-empty
    # - if committed(tp) is None for an assigned partition, seek to beginning
    #   (assignment polls can fetch+discard and leave the cursor at log end)
    # - poll until idle_ms with no records; append values; commit after each batch
    # - close and return the payloads
    raise NotImplementedError


def consumer_lag(group_id: str) -> int:
    """Sum (end_offset - committed_offset) across partitions for group_id."""
    # implement:
    # - discover partitions via KafkaConsumer(...).partitions_for_topic(TOPIC)
    # - consumer.assign(tps); lag += end - (committed or 0) per partition
    # - do NOT subscribe+poll here (that can fetch and confuse offsets)
    raise NotImplementedError


def replay_from_beginning(group_id: str, idle_ms: int = 1500) -> list[str]:
    """Seek the group's partitions to earliest and drain again (nondestructive)."""
    # implement:
    # - subscribe; wait for assignment; seek_to_beginning()
    # - poll until idle; commit; return payloads (full log copy)
    raise NotImplementedError


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "reset":
        ensure_topic()
        print("topic reset")
        return

    if cmd == "demo":
        ensure_topic()

        n = produce_all([f"m{i}" for i in range(1, 6)])
        print(f"produced={n}")  # 5 — succeeds even with no consumers

        analytics = drain_group(GROUP_ANALYTICS)
        print(f"analytics_first={analytics}")  # ['m1', ..., 'm5']
        print(f"analytics_lag_after={consumer_lag(GROUP_ANALYTICS)}")  # 0

        # Producers keep appending while a consumer is idle — no refuse-on-full
        n2 = produce_all([f"m{i}" for i in range(6, 9)])
        print(f"produced_more={n2}")  # 3
        print(f"analytics_lag_behind={consumer_lag(GROUP_ANALYTICS)}")  # 3

        # Independent consumer group: full fan-out copy from earliest
        indexer = drain_group(GROUP_INDEXER)
        print(f"indexer_all={indexer}")  # m1..m8
        print(f"analytics_still_lag={consumer_lag(GROUP_ANALYTICS)}")  # still 3

        # Catch up analytics, then rewind and replay (log is nondestructive)
        caught = drain_group(GROUP_ANALYTICS)
        print(f"analytics_catchup={caught}")  # m6..m8
        replayed = replay_from_beginning(GROUP_ANALYTICS)
        print(f"analytics_replay={replayed}")  # m1..m8
        return

    print("usage: python3 ch12_log_queue.py [reset|demo]", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
