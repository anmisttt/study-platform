#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
import apache_beam as beam
from apache_beam.options.pipeline_options import PipelineOptions

with beam.Pipeline(options=PipelineOptions(["--runner=DirectRunner"])) as pipeline:
    _ = pipeline | beam.Create(["cache-prism-runner"])
PY
