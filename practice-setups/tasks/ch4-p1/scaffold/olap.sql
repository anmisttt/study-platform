-- olap.sql — ClickHouse analytics schema (stubs)
DROP TABLE IF EXISTS fact_orders;
DROP TABLE IF EXISTS fact_orders_monthly_by_category;

CREATE TABLE fact_orders (
  event_date    Date,
  event_time    DateTime,
  order_id      UInt64,
  customer_id   UInt64,
  product_id    UInt32,
  category_id   String,          -- choose LowCardinality(String)
  status        String,          -- choose LowCardinality(String)
  country_code  FixedString(2),  -- choose LowCardinality(FixedString(2))
  quantity      UInt32,
  unit_price    Decimal(10, 2),
  revenue       Decimal(12, 2) MATERIALIZED quantity * unit_price
)
ENGINE = MergeTree               -- choose ENGINE (MergeTree is correct here)
PARTITION BY tuple()             -- choose PARTITION BY toYYYYMM(event_date)
ORDER BY tuple()                 -- choose ORDER BY (event_date, category_id, customer_id)
SETTINGS index_granularity = 8192;

-- implement monthly-by-category MV with SummingMergeTree (sum revenue by month + category)
-- CREATE MATERIALIZED VIEW fact_orders_monthly_by_category
-- ENGINE = SummingMergeTree
-- PARTITION BY ...
-- ORDER BY ...
-- AS SELECT ... FROM fact_orders GROUP BY ...;

INSERT INTO fact_orders
  (event_date, event_time, order_id, customer_id, product_id, category_id, status, country_code, quantity, unit_price)
VALUES
  (today() - 40, now() - INTERVAL 40 DAY, 1001, 42, 1, 'Electronics', 'shipped', 'DE', 1, 49.99),
  (today() - 40, now() - INTERVAL 40 DAY, 1001, 42, 2, 'Clothing',    'shipped', 'DE', 1, 29.99),
  (today() - 10, now() - INTERVAL 10 DAY, 1002, 42, 2, 'Clothing',    'shipped', 'DE', 1, 49.99),
  (today() - 2,  now() - INTERVAL 2 DAY,  1003, 7,  1, 'Electronics', 'pending', 'US', 1, 29.99);

-- Demo workload B-style checks (uncomment after apply)
-- SELECT toStartOfMonth(event_date) AS month, category_id, sum(revenue) AS revenue
-- FROM fact_orders GROUP BY month, category_id ORDER BY month, revenue DESC;
-- SELECT toDate(event_time) AS day, status, count() AS orders
-- FROM fact_orders WHERE event_time >= now() - INTERVAL 90 DAY
-- GROUP BY day, status ORDER BY day, status;
