# ch4_orders_insert_load.py
import time
import uuid
from datetime import datetime, timezone

import mysql.connector

BATCH = 500
TOTAL = 20_000  # raise toward 100_000+ for clearer bloat; keep modest on a laptop

conn = mysql.connector.connect(
    host="mysql", user="root", password="lab", database="ch4_lab"
)
cur = conn.cursor()

sql = (
    "INSERT INTO orders (id, customer_id, status, total_amount, created_at) "
    "VALUES (%s, %s, %s, %s, %s)"
)

t0 = time.perf_counter()
for i in range(TOTAL):
    # TODO: dual-write a monotonic id here via a hand-rolled UUIDv7 helper
    #       (time + os.urandom; do NOT call uuid.uuid7() — not in the 3.12 stdlib);
    #       after migration, insert with the monotonic column as the clustered PK
    order_id = uuid.uuid4().bytes
    cur.execute(
        sql,
        (order_id, i % 10_000, "pending", 19.99, datetime.now(timezone.utc)),
    )
    if (i + 1) % BATCH == 0:
        conn.commit()
        print(f"inserted {i + 1}/{TOTAL}")
conn.commit()
elapsed = time.perf_counter() - t0
print(f"done: {TOTAL} rows in {elapsed:.2f}s ({TOTAL / elapsed:.0f} rows/s)")
cur.close()
conn.close()
