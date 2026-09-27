CREATE ROLE replicator WITH REPLICATION LOGIN;

CREATE TABLE profiles (
  user_id bigint PRIMARY KEY,
  display_name text NOT NULL,
  bio text NOT NULL DEFAULT ''
);

CREATE TABLE last_write (
  user_id bigint PRIMARY KEY REFERENCES profiles(user_id),
  written_at timestamptz NOT NULL,
  write_lsn pg_lsn NOT NULL
);

INSERT INTO profiles (user_id, display_name, bio) VALUES
  (101, 'Alice', 'Engineer'),
  (202, 'Bob', 'Designer');
