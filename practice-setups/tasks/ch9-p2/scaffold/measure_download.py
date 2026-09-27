# measure_download.py — compare CLOCK_MONOTONIC vs wall-clock around one download
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import time


def download_once(url: str) -> None:
    # TODO: measure one download.
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
