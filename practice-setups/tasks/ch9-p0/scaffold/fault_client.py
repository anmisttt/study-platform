#!/usr/bin/env python3
"""fault_client.py — HTTP client for network fault injection lab."""
from __future__ import annotations

import argparse
import http.client
import random
import sys
import time
from typing import List, Optional
from urllib.parse import urlparse


def percentile(sorted_vals: List[float], p: float) -> float:
    """Nearest-rank percentile on a pre-sorted list (p in 0..100)."""
    if not sorted_vals:
        raise ValueError("empty sample")
    k = max(0, min(len(sorted_vals) - 1, int(round((p / 100.0) * (len(sorted_vals) - 1)))))
    return sorted_vals[k]


def print_percentiles(latencies_s: List[float]) -> None:
    """Print p50 and p99 from client-recorded latencies (seconds)."""
    if not latencies_s:
        print("no samples", file=sys.stderr)
        return
    s = sorted(latencies_s)
    print(f"n={len(s)} p50={percentile(s, 50):.4f}s p99={percentile(s, 99):.4f}s")


def sleep_before_retry(attempt: int) -> None:
    # implement exponential backoff with full jitter:
    # base=0.1, factor=2, cap=5.0 → delay = random.uniform(0, min(cap, base * factor**attempt))
    # Until Task 4, keep a fixed short pause so the loop still runs.
    time.sleep(0.05)


def one_request(url: str, connect_timeout: float, read_timeout: float) -> tuple[bool, float, Optional[int]]:
    parsed = urlparse(url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    started = time.monotonic()
    conn: Optional[http.client.HTTPConnection] = None
    try:
        conn = http.client.HTTPConnection(host, port, timeout=connect_timeout)
        conn.connect()
        if conn.sock is not None:
            conn.sock.settimeout(read_timeout)
        conn.request("GET", path)
        resp = conn.getresponse()
        resp.read(64)
        return True, time.monotonic() - started, int(resp.status)
    except Exception:
        return False, time.monotonic() - started, None
    finally:
        if conn is not None:
            conn.close()


def main() -> None:
    p = argparse.ArgumentParser(description="Fault-injection HTTP client")
    p.add_argument("--url", default="http://127.0.0.1:8080/")
    p.add_argument("--requests", type=int, default=40, help="number of attempts")
    p.add_argument("--connect-timeout", type=float, default=2.0)
    p.add_argument("--read-timeout", type=float, default=2.0)
    p.add_argument("--max-retries", type=int, default=0, help="retries after first failure (Task 4)")
    args = p.parse_args()

    latencies: List[float] = []
    fails = 0
    retries_total = 0

    for i in range(args.requests):
        attempt = 0
        ok, elapsed, code = one_request(args.url, args.connect_timeout, args.read_timeout)
        while not ok and attempt < args.max_retries:
            # retries already wired; only edit sleep_before_retry for Task 4
            attempt += 1
            retries_total += 1
            sleep_before_retry(attempt - 1)
            ok, elapsed, code = one_request(args.url, args.connect_timeout, args.read_timeout)

        latencies.append(elapsed)
        if ok:
            print(f"OK {code} {elapsed:.4f}s")
        else:
            fails += 1
            print(f"FAIL {elapsed:.4f}s")

    print_percentiles(latencies)
    print(f"fails={fails} retries_total={retries_total}")


if __name__ == "__main__":
    main()
