-- PostgreSQL
DROP TABLE IF EXISTS ch2_products CASCADE;

DROP TABLE IF EXISTS electronics CASCADE;

CREATE TABLE ch2_products (
  id    SERIAL PRIMARY KEY,
  name  TEXT           NOT NULL,
  type  TEXT           NOT NULL,
  price NUMERIC(10,2)  NOT NULL,
  attrs JSONB          NOT NULL
);

INSERT INTO ch2_products (name, type, price, attrs) VALUES
  ('ThinkPad X1 Carbon',        'electronics', 1499.00, '{"cpu":"Intel i7",  "ram_gb":16,"storage_gb":512, "display_inch":14.0}'),
  ('Dell XPS 15',               'electronics', 1799.00, '{"cpu":"Intel i9",  "ram_gb":32,"storage_gb":1024,"display_inch":15.6}'),
  ('Raspberry Pi 5',            'electronics',   80.00, '{"cpu":"ARM Cortex","ram_gb":8, "storage_gb":0,  "display_inch":null}'),
  ('Merino Wool Sweater',       'clothing',      89.99, '{"sizes":["S","M","L","XL"],"colors":["navy","grey"],"material":"merino wool"}'),
  ('Waterproof Running Jacket', 'clothing',     149.99, '{"sizes":["M","L","XL"],   "colors":["black","red"], "material":"nylon","waterproof":true}'),
  ('Clean Code',                'book',          35.99, '{"author":"Robert C. Martin","pages":431,"isbn":"978-0-13-235088-4","year":2008}'),
  ('The Pragmatic Programmer',  'book',          49.99, '{"author":"David Thomas",     "pages":352,"isbn":"978-0-13-595705-9","year":2019}');

-- implement: attrs->'sizes' ? 'M'

-- Part B: merge in_stock:true onto every existing attrs document
UPDATE ch2_products
SET    attrs = attrs  -- implement || '{"in_stock": true}'::jsonb
WHERE  TRUE;

-- Part B: insert out-of-stock book 'Refactoring' with in_stock:false in attrs
INSERT INTO ch2_products (name, type, price, attrs) VALUES
  ('Refactoring', 'book', 44.99, '{}');

-- implement: after UPDATE/INSERT, expect true for seed rows and false for Refactoring

-- Part C: insert electronics product 'Mystery Gadget' with ram_gb but no cpu key
INSERT INTO ch2_products (name, type, price, attrs)
VALUES ('Mystery Gadget', 'electronics', 59.00, '{"ram_gb": 4}');

-- implement: confirm Mystery Gadget cpu is NULL

-- Part C: write equivalent relational CREATE TABLE electronics that enforces cpu NOT NULL
CREATE TABLE electronics (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL
  -- implement: cpu TEXT NOT NULL (and remaining columns: ram_gb, storage_gb, display_inch)
);
