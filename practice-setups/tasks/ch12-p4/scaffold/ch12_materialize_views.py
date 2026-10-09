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
        [
            "docker", "exec", "-i", "lab-ch12-p4",
            "psql", "-U", "postgres", "-d", DB, "-At", "-F", "\t", "-c", sql,
        ],
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
    # TODO: apply one event to source state and materialized views
    raise NotImplementedError

def run_consumer() -> int:
    last = int(psql("SELECT last_seq FROM social.consumer_offset WHERE name = 'materializers';").strip() or "0")
    n = 0
    for ev in fetch_events_after(last):
        apply_event(ev)
        n += 1
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
