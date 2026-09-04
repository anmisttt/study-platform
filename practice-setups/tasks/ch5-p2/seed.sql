-- Pre-seeded state: v2 already wrote a display_name for alice.
DROP TABLE IF EXISTS ch5_user_profiles CASCADE;

CREATE TABLE ch5_user_profiles (
  user_id   BIGINT PRIMARY KEY,
  email     TEXT NOT NULL,
  bio       TEXT NOT NULL DEFAULT '',
  display_name TEXT
);

INSERT INTO ch5_user_profiles (user_id, email, bio, display_name) VALUES
  (1, 'alice@example.com', 'Platform engineer', 'Alice T.'),
  (2, 'bob@example.com',   'SRE',               NULL);
