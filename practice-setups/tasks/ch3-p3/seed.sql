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
