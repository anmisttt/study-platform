-- setup.sql — OLTP system of record + warehouse stubs for student work
CREATE SCHEMA oltp;

CREATE SCHEMA warehouse;

CREATE TABLE oltp.customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  signup_date DATE NOT NULL
);

CREATE TABLE oltp.products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE oltp.orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES oltp.customers (id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE oltp.order_items (
  order_id BIGINT NOT NULL REFERENCES oltp.orders (id),
  product_id BIGINT NOT NULL REFERENCES oltp.products (id),
  quantity INT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

INSERT INTO oltp.customers (name, country, signup_date) VALUES
  ('Ada', 'US', '2024-01-10'),
  ('Boris', 'DE', '2024-02-01'),
  ('Chen', 'US', '2024-03-15');

INSERT INTO oltp.products (name, category, unit_price) VALUES
  ('Mug', 'Home', 12.00),
  ('Keyboard', 'Electronics', 80.00),
  ('Notebook', 'Home', 5.50);

INSERT INTO oltp.orders (customer_id, created_at) VALUES
  (1, '2024-04-05 10:00:00+00'),
  (2, '2024-04-20 15:30:00+00'),
  (1, '2024-05-02 09:00:00+00'),
  (3, '2024-05-18 18:00:00+00');

INSERT INTO oltp.order_items (order_id, product_id, quantity, price) VALUES
  (1, 1, 2, 12.00),
  (1, 3, 1, 5.50),
  (2, 2, 1, 80.00),
  (3, 1, 1, 12.00),
  (3, 2, 1, 80.00),
  (4, 3, 4, 5.50);
