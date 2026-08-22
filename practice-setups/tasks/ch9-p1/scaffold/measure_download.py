# measure_download.py — compare CLOCK_MONOTONIC vs wall-clock around one download
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import time


def download_once(url: str) -> None:
    # implement: record t0_mono=time.monotonic(), t0_wall=time.time();
    # run curl to url (discard body; print curl time_total via -w);
    # then print mono_elapsed and wall_elapsed.
    # SIGSTOP/GC does NOT freeze clocks — both mono and wall keep advancing
    # while the process is paused; elapsed values include the pause.
    # Compare inflated mono_elapsed/wall_elapsed to an uninterrupted baseline
    # curl time_total (do not use mono−wall as a pause signal).
    # Until Task 4, just run curl without timing.
    subprocess.run(
        ["curl", "-o", "/dev/null", "-sS", url],
        check=False,
    )


def main() -> None:
    p = argparse.ArgumentParser(description="Monotonic vs wall-clock download timing")
    p.add_argument("--url", default="http://127.0.0.1:8080/")
    args = p.parse_args()
    download_once(args.url)


if __name__ == "__main__":
    main()
