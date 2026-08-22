#!/usr/bin/env python3
from pathlib import Path
import random

random.seed(11)
urls = [f"/page/{i}.html" for i in range(500)] + ["/css/app.css", "/favicon.ico", "/"]
lines = []
for _ in range(50_000):
    ip = f"203.0.113.{random.randint(1, 200)}"
    url = random.choices(urls, weights=[1] * 500 + [50, 80, 40])[0]
    lines.append(
        f'{ip} - - [24/Jul/2026:12:00:00 +0000] "GET {url} HTTP/1.1" 200 123 "-" "Mozilla/5.0"\n'
    )
Path("access.log").write_text("".join(lines), encoding="utf-8")
print("wrote access.log", len(lines), "lines")
