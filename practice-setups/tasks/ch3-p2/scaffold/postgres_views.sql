CREATE TABLE orders_view (
  order_id    TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('placed', 'cancelled')),
  total       INTEGER NOT NULL CHECK (total >= 0),
  day         DATE NOT NULL
);

CREATE TABLE daily_revenue_view (
  day         DATE PRIMARY KEY,
  net_revenue INTEGER NOT NULL
);
