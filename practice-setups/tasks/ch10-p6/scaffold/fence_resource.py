#!/usr/bin/env python3
"""Protected resource with a persisted monotonic fencing token. Complete the TODOs."""
import json
import pathlib
import sys

STATE = pathlib.Path("resource-state.json")
token = int(sys.argv[1])
payload = sys.argv[2]

if STATE.exists():
    max_seen = int(json.loads(STATE.read_text())["maxSeen"])
else:
    max_seen = 0

# TODO: reject stale tokens
raise NotImplementedError("compare token against maxSeen")

# TODO: persist accepted writes
raise NotImplementedError("update maxSeen and accept write")
