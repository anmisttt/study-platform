-- ch12_views_setup.sql — event log + empty materialized tables
DROP SCHEMA IF EXISTS social CASCADE;

CREATE SCHEMA social;

CREATE TABLE social.event_log (
  seq       BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload   JSONB NOT NULL,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- View 1: home timeline rows (denormalized inbox)
CREATE TABLE social.home_timeline (
  owner_id   BIGINT NOT NULL,
  post_id    BIGINT NOT NULL,
  author_id  BIGINT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (owner_id, post_id)
);

-- View 2: post counts per author
CREATE TABLE social.user_post_counts (
  user_id    BIGINT PRIMARY KEY,
  post_count BIGINT NOT NULL
);

-- View 3: global recent posts (latest N kept by consumer logic)
CREATE TABLE social.recent_posts (
  post_id    BIGINT PRIMARY KEY,
  author_id  BIGINT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE social.follows (
  follower_id BIGINT NOT NULL,
  followee_id BIGINT NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE social.posts (
  post_id    BIGINT PRIMARY KEY,
  author_id  BIGINT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE social.consumer_offset (
  name TEXT PRIMARY KEY,
  last_seq BIGINT NOT NULL
);

INSERT INTO social.consumer_offset VALUES ('materializers', 0);

INSERT INTO social.event_log (event_type, payload) VALUES
  ('followed',      '{"follower_id":1,"followee_id":2}'),
  ('followed',      '{"follower_id":1,"followee_id":3}'),
  ('post_created',  '{"post_id":10,"author_id":2,"body":"hello from 2","created_at":"2024-06-01T10:00:00Z"}'),
  ('post_created',  '{"post_id":11,"author_id":3,"body":"hello from 3","created_at":"2024-06-01T11:00:00Z"}'),
  ('post_created',  '{"post_id":12,"author_id":2,"body":"second from 2","created_at":"2024-06-01T12:00:00Z"}'),
  ('unfollowed',    '{"follower_id":1,"followee_id":3}'),
  ('post_deleted',  '{"post_id":10,"author_id":2}');
