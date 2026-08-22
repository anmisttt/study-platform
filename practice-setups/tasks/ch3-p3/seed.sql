-- PostgreSQL
DROP TABLE IF EXISTS ch2_orders CASCADE;

CREATE TABLE ch2_orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT           NOT NULL,
  category    TEXT          NOT NULL,
  city        TEXT          NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  placed_at   TIMESTAMP     NOT NULL
);

INSERT INTO ch2_orders (customer_id, category, city, amount, placed_at) VALUES
  (1, 'Electronics', 'Berlin',    299.99, '2024-01-05 10:00:00'),
  (2, 'Clothing',    'Berlin',     49.99, '2024-01-12 14:00:00'),
  (3, 'Electronics', 'London',    599.00, '2024-01-18 09:00:00'),
  (4, 'Books',       'Berlin',     19.99, '2024-02-03 11:00:00'),
  (5, 'Electronics', 'Berlin',    899.00, '2024-02-10 16:00:00'),
  (6, 'Clothing',    'London',     89.99, '2024-02-14 13:00:00'),
  (7, 'Books',       'London',     34.99, '2024-02-20 10:00:00'),
  (8, 'Electronics', 'Amsterdam', 149.99, '2024-03-01 12:00:00'),
  (9, 'Clothing',    'Berlin',     69.99, '2024-03-08 15:00:00'),
  (10,'Books',       'Amsterdam',  24.99, '2024-03-15 09:00:00');

-- Part A: monthly category revenue
SELECT
  -- implement date_trunc month + category GROUP BY and SUM(amount)
  NULL AS month,
  NULL AS category,
  NULL AS revenue
FROM ch2_orders;

-- Part A: top category per city via window
WITH city_cat AS (
  -- implement GROUP BY city, category with SUM(amount) AS revenue
  SELECT NULL AS city, NULL AS category, NULL AS revenue
),
ranked AS (
  SELECT city, category, revenue,
         -- implement RANK() OVER (PARTITION BY city ORDER BY revenue DESC)
         NULL AS rnk
  FROM city_cat
)
SELECT city, category, revenue FROM ranked WHERE rnk = 1 ORDER BY city;

-- Part B: MapReduce-style CTEs (map then reduce)
WITH
  mapped AS (
    SELECT
      -- implement map-key: YYYY-MM|category composite key
      NULL AS key,
      amount AS value
    FROM ch2_orders
  ),
  reduced AS (
    SELECT key,
           -- implement reduce-SUM of value GROUP BY key
           NULL AS revenue
    FROM   mapped
    GROUP BY key
  )
SELECT split_part(key,'|',1) AS month, split_part(key,'|',2) AS category, revenue
FROM   reduced
ORDER BY month, revenue DESC;

-- Part B: same pipeline with a post-aggregation filter (revenue > 200)
WITH mapped AS (
    SELECT
      -- implement map-key (same as above)
      NULL AS key,
      amount AS value
    FROM ch2_orders
),
reduced AS (
    SELECT key,
           -- implement reduce-SUM
           NULL AS revenue
    FROM mapped
    GROUP BY key
)
SELECT split_part(key,'|',1) AS month, split_part(key,'|',2) AS category, revenue
FROM   reduced
WHERE  TRUE  -- implement post-aggregation filter: revenue > 200
ORDER BY month, revenue DESC;
