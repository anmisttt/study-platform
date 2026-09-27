#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


report_path = Path(sys.argv[1] if len(sys.argv) > 1 else "experiment_report.md")
text = report_path.read_text(encoding="utf-8")

latency = r"n=40 p50=\d+(?:\.\d+)?s p99=\d+(?:\.\d+)?s"
totals = r"fails=\d+ retries_total=\d+"
required = {
    "clean_latency": latency,
    "delay_200ms_latency": latency,
    "stub_loss50_retries5_latency": latency,
    "stub_loss50_retries5_totals": totals,
    "final_loss50_retries0_totals": totals,
    "final_loss50_retries5_totals": totals,
}

for label, value_pattern in required.items():
    if not re.search(rf"(?m)^{re.escape(label)}: {value_pattern}$", text):
        raise SystemExit(f"missing captured output for {label}")

zero_retry = re.search(
    r"(?m)^final_loss50_retries0_totals: fails=\d+ retries_total=(\d+)$", text
)
assert zero_retry is not None and zero_retry.group(1) == "0"

print("experiment report checks passed")
