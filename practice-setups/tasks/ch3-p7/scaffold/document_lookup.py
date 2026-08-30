from __future__ import annotations

import os

from pymongo import MongoClient


MONGO_URL = os.environ["MONGO_URL"]
MONGO_DB = os.environ["MONGO_DB"]


def joined_orders(db) -> list[dict]:
    pipeline = [
        # TODO: build the aggregation pipeline
    ]
    return list(db.orders.aggregate(pipeline))


def main() -> None:
    with MongoClient(MONGO_URL) as client:
        client.admin.command("ping")
        rows = joined_orders(client[MONGO_DB])

    shape = [
        (row["order_id"], row["total"], row.get("customer_name"), row.get("tier"))
        for row in rows
    ]
    for row in shape:
        print(row)
    assert shape == [
        (1001, 120, "Alice", "gold"),
        (1003, 75, "Alice", "gold"),
        (1004, 50, "Carol", "bronze"),
        (1005, 60, None, None),
    ]


if __name__ == "__main__":
    main()
