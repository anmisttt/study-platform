#!/usr/bin/env python3
from pathlib import Path
import subprocess

import ch12_materialize_views as consumer

CONTAINER = "lab-ch12-p4"
DB = "ch12_views_lab"


def run(*args: str, stdin=None) -> str:
    return subprocess.check_output(args, stdin=stdin, text=True)


def psql(sql: str) -> str:
    return run(
        "docker", "exec", "-i", CONTAINER,
        "psql", "-U", "postgres", "-d", DB, "-At", "-F", "|", "-c", sql,
    ).strip()


with Path("setup.sql").open() as setup:
    run(
        "docker", "exec", "-i", CONTAINER,
        "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB,
        stdin=setup,
    )

consumer.RECENT_LIMIT = 2
assert consumer.run_consumer() == 7
assert psql("SELECT owner_id, post_id, author_id FROM social.home_timeline ORDER BY 1,2") == "1|12|2"
assert psql("SELECT user_id, post_count FROM social.user_post_counts ORDER BY 1") == "2|1\n3|1"
assert psql("SELECT post_id FROM social.recent_posts ORDER BY created_at DESC, post_id DESC") == "12\n11"

psql("""
INSERT INTO social.event_log (event_type, payload) VALUES
('followed', '{"follower_id":4,"followee_id":2}')
""")

assert consumer.run_consumer() == 1
assert psql("SELECT post_id FROM social.home_timeline WHERE owner_id = 4 ORDER BY post_id") == "12"

psql("""
CREATE FUNCTION social.reject_offset_10() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.last_seq = 10 THEN
    RAISE EXCEPTION 'injected offset failure';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER reject_offset_10 BEFORE UPDATE ON social.consumer_offset
FOR EACH ROW EXECUTE FUNCTION social.reject_offset_10();
INSERT INTO social.event_log (event_type, payload) VALUES
('post_created', '{"post_id":13,"author_id":2,"body":"tie 13","created_at":"2024-06-01T13:00:00Z"}'),
('post_created', '{"post_id":14,"author_id":2,"body":"tie 14","created_at":"2024-06-01T13:00:00Z"}'),
('post_created', '{"post_id":15,"author_id":2,"body":"tie 15","created_at":"2024-06-01T13:00:00Z"}');
""")

try:
    consumer.run_consumer()
except subprocess.CalledProcessError:
    pass
else:
    raise AssertionError("injected database failure did not reach the consumer")

assert psql("SELECT count(*) FROM social.posts WHERE post_id = 13") == "1"
assert psql("SELECT count(*) FROM social.home_timeline WHERE post_id = 13") == "2"
assert psql("SELECT count(*) FROM social.posts WHERE post_id IN (14, 15)") == "0"
assert psql("SELECT count(*) FROM social.home_timeline WHERE post_id = 14") == "0"
assert psql("SELECT count(*) FROM social.recent_posts WHERE post_id = 14") == "0"
assert psql("SELECT post_count FROM social.user_post_counts WHERE user_id = 2") == "2"
assert psql("SELECT last_seq FROM social.consumer_offset WHERE name = 'materializers'") == "9"

psql("DROP TRIGGER reject_offset_10 ON social.consumer_offset; DROP FUNCTION social.reject_offset_10();")
assert consumer.run_consumer() == 2
assert psql("SELECT count(*) FROM social.posts WHERE post_id = 13") == "1"
assert psql("SELECT post_count FROM social.user_post_counts WHERE user_id = 2") == "4"
assert psql("SELECT last_seq FROM social.consumer_offset WHERE name = 'materializers'") == "11"
assert psql("SELECT post_id FROM social.recent_posts ORDER BY created_at DESC, post_id DESC") == "15\n14"

print("verification passed")
