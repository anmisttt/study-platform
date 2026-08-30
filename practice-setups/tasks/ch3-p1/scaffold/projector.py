from __future__ import annotations

import json
import os

import psycopg
from confluent_kafka import Consumer, TopicPartition
from psycopg.rows import dict_row
from pymongo import MongoClient


KAFKA_BOOTSTRAP_SERVERS = os.environ["KAFKA_BOOTSTRAP_SERVERS"]
KAFKA_TOPIC = os.environ["KAFKA_TOPIC"]
POSTGRES_DSN = os.environ["POSTGRES_DSN"]
MONGO_URL = os.environ["MONGO_URL"]
MONGO_DB = os.environ["MONGO_DB"]


def read_events() -> list[dict]:
    # TODO: replay Kafka partition
    raise NotImplementedError


def rebuild_views(events: list[dict]) -> None:
    # TODO: rebuild PostgreSQL and MongoDB projections
    raise NotImplementedError


def snapshot() -> dict:
    with psycopg.connect(POSTGRES_DSN, row_factory=dict_row) as postgres:
        orders = list(
            postgres.execute(
                """
                SELECT order_id, customer_id, status, total, day::text AS day
                FROM orders_view
                ORDER BY order_id
                """
            )
        )
        revenue = list(
            postgres.execute(
                """
                SELECT day::text AS day, net_revenue
                FROM daily_revenue_view
                ORDER BY day
                """
            )
        )

    mongo = MongoClient(MONGO_URL)
    customers = list(
        mongo[MONGO_DB].customer_spend_view.find(
            {}, {"_id": 0, "customer_id": 1, "net_spend": 1}
        ).sort("customer_id", 1)
    )
    mongo.close()
    return {"orders": orders, "daily_revenue": revenue, "customer_spend": customers}


def main() -> None:
    events = read_events()
    rebuild_views(events)
    print(json.dumps({"event_count": len(events), "views": snapshot()}, indent=2))


if __name__ == "__main__":
    main()
