#!/usr/bin/env python3
"""Rebuild three materialized views from social.event_log."""
from __future__ import annotations

import json
import subprocess
from typing import Any

DB = "ch12_views_lab"
RECENT_LIMIT = 100

def psql(sql: str) -> str:
    return subprocess.check_output(
        ["psql", "-d", DB, "-At", "-F", "\t", "-c", sql],
        text=True,
    )

def fetch_events_after(seq: int) -> list[dict[str, Any]]:
    raw = psql(
        "SELECT seq || E'\\t' || event_type || E'\\t' || payload::text "
        f"FROM social.event_log WHERE seq > {seq} ORDER BY seq;"
    )
    rows = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        s, et, payload = line.split("\t", 2)
        rows.append({"seq": int(s), "event_type": et, "payload": json.loads(payload)})
    return rows

def apply_event(ev: dict[str, Any]) -> None:
    # TODO: update follows/posts state AND the three views:
    # home_timeline, user_post_counts, recent_posts (keep <= RECENT_LIMIT)
    # Rules:
    # - post_created by U: insert social.posts; bump user_post_counts;
    #   insert into home_timeline for every follower of U; upsert recent_posts
    # - post_deleted: remove from posts, timelines, recent_posts; decrement count
    # - followed: insert follows; backfill followee's existing posts into follower timeline
    # - unfollowed: delete follows; remove followee posts from follower timeline
    raise NotImplementedError

def run_consumer() -> int:
    last = int(psql("SELECT last_seq FROM social.consumer_offset WHERE name = 'materializers';").strip() or "0")
    n = 0
    for ev in fetch_events_after(last):
        apply_event(ev)
        last = ev["seq"]
        n += 1
    psql(f"UPDATE social.consumer_offset SET last_seq = {last} WHERE name = 'materializers';")
    return n

def main() -> None:
    applied = run_consumer()
    tl = psql("SELECT owner_id, post_id, author_id FROM social.home_timeline ORDER BY 1,2;")
    counts = psql("SELECT user_id, post_count FROM social.user_post_counts ORDER BY 1;")
    recent = psql("SELECT post_id FROM social.recent_posts ORDER BY created_at DESC, post_id DESC;")
    print(f"applied={applied}")
    print("timeline:")
    print(tl)
    print("counts:")
    print(counts)
    print("recent:")
    print(recent)

if __name__ == "__main__":
    main()
