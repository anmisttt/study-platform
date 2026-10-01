#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from fastembed import TextEmbedding

list(TextEmbedding("BAAI/bge-small-en", cache_dir="/opt/fastembed_cache").embed(["cache warmup"]))
PY
