#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
import tempfile


LABELS = ("curl_time_total", "mono_elapsed", "wall_elapsed")


def run_measurement(url: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", "measure_download.py", "--url", url],
        capture_output=True,
        text=True,
        env=env,
    )


def parse_values(result: subprocess.CompletedProcess[str]) -> dict[str, float]:
    assert result.returncode == 0, result.stderr
    assert len(result.stdout.splitlines()) == 3, result.stdout
    number = r"(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
    values: dict[str, float] = {}
    for label in LABELS:
        match = re.search(rf"(?m)^{label}=({number})$", result.stdout)
        assert match is not None, f"missing {label}=<seconds> in:\n{result.stdout}"
        values[label] = float(match.group(1))
    return values


real_values = parse_values(run_measurement("http://127.0.0.1:8080/"))
assert all(value > 0 for value in real_values.values())
assert abs(real_values["mono_elapsed"] - real_values["wall_elapsed"]) < 0.5
assert real_values["mono_elapsed"] + 0.5 >= real_values["curl_time_total"]

failed = run_measurement("http://127.0.0.1:1/")
assert failed.returncode != 0, "a failed curl download must make the script fail"

with tempfile.TemporaryDirectory() as tmp:
    fake_curl = Path(tmp) / "curl"
    fake_curl.write_text(
        """#!/usr/bin/env python3
import sys
import time

args = sys.argv[1:]

def value_for(*names):
    for i, arg in enumerate(args):
        if arg in names and i + 1 < len(args):
            return args[i + 1]
        for name in names:
            if arg.startswith(name + "="):
                return arg.split("=", 1)[1]
    return None

assert value_for("-o", "--output") == "/dev/null"
assert (
    "-sS" in args
    or "-Ss" in args
    or ("-s" in args and "-S" in args)
    or ("--silent" in args and "--show-error" in args)
)
write_out = value_for("-w", "--write-out")
assert write_out is not None and "%{time_total}" in write_out
time.sleep(0.05)
rendered = write_out.replace("%{time_total}", "0.025")
sys.stdout.write(rendered.replace(chr(92) + "n", chr(10)))
"""
    )
    fake_curl.chmod(0o755)
    env = os.environ.copy()
    env["PATH"] = f"{tmp}{os.pathsep}{env['PATH']}"
    probed_values = parse_values(run_measurement("http://example.invalid/", env))

assert probed_values["curl_time_total"] == 0.025
assert probed_values["mono_elapsed"] >= 0.04
assert probed_values["wall_elapsed"] >= 0.04
assert abs(probed_values["mono_elapsed"] - probed_values["wall_elapsed"]) < 0.1
print("timing verification passed")
