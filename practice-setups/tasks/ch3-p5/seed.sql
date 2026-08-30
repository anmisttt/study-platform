-- PostgreSQL
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
