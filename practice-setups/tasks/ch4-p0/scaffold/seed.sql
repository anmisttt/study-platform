-- setup.sql — PostgreSQL operational schema (stubs)
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;

CREATE TABLE products (
  id       BIGINT PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE orders (
  id            BIGINT PRIMARY KEY,
  customer_id   BIGINT        NOT NULL,
  status        TEXT          NOT NULL,
  total_amount  NUMERIC(10,2) NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- choose indexes for:
--   WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20
-- optional: partial index for open statuses (pending/processing)
-- (PRIMARY KEY on id already covers WHERE id = $1)

CREATE TABLE order_items (
  order_id    BIGINT  NOT NULL REFERENCES orders(id),
  product_id  BIGINT  NOT NULL REFERENCES products(id),
  quantity    INT     NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL
  -- choose PRIMARY KEY (order_id, product_id)
);

INSERT INTO products (id, name, category) VALUES
  (1, 'Keyboard', 'Electronics'),
  (2, 'Hoodie', 'Clothing');
INSERT INTO orders (id, customer_id, status, total_amount, created_at) VALUES
  (1001, 42, 'pending', 79.98, now() - interval '2 days'),
  (1002, 42, 'shipped', 49.99, now() - interval '1 day'),
  (1003, 7,  'pending', 29.99, now());
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  (1001, 1, 1, 49.99),
  (1001, 2, 1, 29.99),
  (1002, 2, 1, 49.99),
  (1003, 1, 1, 29.99);

-- Demo workload A (uncomment after apply)
-- SELECT id, customer_id, status, total_amount, created_at FROM orders WHERE id = 1001;
-- SELECT id, status, total_amount, created_at FROM orders WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 20;
