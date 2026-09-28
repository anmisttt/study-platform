#!/usr/bin/env python3
import json
import pathlib
import subprocess
import sys
import tempfile

SCRIPT = pathlib.Path(__file__).with_name("fence_resource.py").resolve()


def write(cwd, token, payload):
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(token), payload],
        cwd=cwd,
        text=True,
        capture_output=True,
    )


with tempfile.TemporaryDirectory() as tmp:
    first = write(tmp, 10, "first")
    equal = write(tmp, 10, "equal")
    newer = write(tmp, 12, "newer")
    stale = write(tmp, 11, "stale")
    state = json.loads(pathlib.Path(tmp, "resource-state.json").read_text())

    assert first.returncode == 0 and first.stdout.startswith("ACCEPT")
    assert equal.returncode == 0 and equal.stdout.startswith("ACCEPT")
    assert newer.returncode == 0 and newer.stdout.startswith("ACCEPT")
    assert stale.returncode != 0 and stale.stdout.startswith("REJECT")
    assert state["maxSeen"] == 12
    assert state["payload"] == "newer"

print("fencing checks passed")
