-- Pre-seeded state: one counter row at zero.
DROP TABLE IF EXISTS page_views;

CREATE TABLE page_views (
  page_id    TEXT   PRIMARY KEY,
  view_count BIGINT NOT NULL DEFAULT 0,
  version    BIGINT NOT NULL DEFAULT 0
);

INSERT INTO page_views VALUES ('home', 0, 0);
