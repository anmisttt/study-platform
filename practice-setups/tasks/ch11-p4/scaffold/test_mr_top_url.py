#!/usr/bin/env python3
from collections import Counter
import json
from pathlib import Path


def read_result(path):
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1, f"{path}: expected one result, got {len(lines)}"
    count, url = lines[0].split("\t", 1)
    return json.loads(count), json.loads(url)


counts = Counter(
    line.split()[6]
    for line in Path("access.log").read_text(encoding="utf-8").splitlines()
)
expected = max((count, url) for url, count in counts.items())

for result_path in ("out_inline.txt", "out_local.txt"):
    assert read_result(result_path) == expected, f"{result_path}: incorrect result"

print("inline and local outputs verified")
