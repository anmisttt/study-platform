-- PostgreSQL
DROP TABLE IF EXISTS ch2_notif_relational CASCADE;

DROP TABLE IF EXISTS ch2_notif_document  CASCADE;

CREATE TABLE ch2_notif_relational (
  id         SERIAL PRIMARY KEY,
  user_id    INT  NOT NULL,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ch2_notif_document (
  id         SERIAL PRIMARY KEY,
  user_id    INT  NOT NULL,
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO ch2_notif_relational (user_id, type, message) VALUES
  (1, 'email', 'Your order #1042 has shipped'),
  (2, 'push',  'Flash sale: 40% off electronics'),
  (3, 'sms',   'Your verification code is 8271'),
  (1, 'push',  'Your package was delivered');

INSERT INTO ch2_notif_document (user_id, type, payload) VALUES
  (1, 'email', '{"message": "Your order #1042 has shipped",    "to": "alice@example.com", "subject": "Order update"}'),
  (2, 'push',  '{"message": "Flash sale: 40% off electronics",  "device_token": "tok_abc", "badge": 1}'),
  (3, 'sms',   '{"message": "Your verification code is 8271",   "phone": "+49123456789", "priority": "high"}'),
  (1, 'push',  '{"message": "Your package was delivered",        "device_token": "tok_abc", "badge": 2}');

-- Part A: schema-on-write — add priority with a default for every existing row
ALTER TABLE ch2_notif_relational
  ADD COLUMN IF NOT EXISTS priority TEXT;

-- implement: use NOT NULL DEFAULT 'normal' instead of nullable TEXT

UPDATE ch2_notif_relational
SET    priority = priority  -- implement: set priority = 'high'
WHERE  FALSE;

-- Part C: patch only push rows with ttl_seconds = 86400 via JSONB || merge
UPDATE ch2_notif_document
SET    payload = payload  -- implement || merge of '{"ttl_seconds": 86400}'::jsonb
WHERE  type = 'push';

INSERT INTO ch2_notif_document (user_id, type, payload) VALUES
  (2, 'push', '{"message": "New message from Sarah", "device_token": "tok_xyz", "badge": 3}');
