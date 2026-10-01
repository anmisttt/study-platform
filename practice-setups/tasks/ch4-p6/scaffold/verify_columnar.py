import json
import tempfile
from pathlib import Path

import pyarrow.compute as pc
import pyarrow.parquet as pq

from columnar_lab import (
    build_events,
    parquet_layout,
    scan_country_revenue,
    write_parquet,
    write_row_file,
)


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    row_path = root / "events.jsonl"
    parquet_path = root / "events.parquet"
    table = build_events()

    write_row_file(table, row_path)
    write_parquet(table, parquet_path)

    rows = [json.loads(line) for line in row_path.read_text(encoding="utf-8").splitlines()]
    assert rows == table.to_pylist()

    projected = scan_country_revenue(parquet_path, "GE")
    assert projected.column_names == ["user_id", "revenue"]
    expected = table.filter(pc.equal(table["country"], "GE")).select(
        ["user_id", "revenue"]
    )
    assert projected.equals(expected)

    metadata = pq.ParquetFile(parquet_path).metadata
    assert metadata.num_row_groups == 8
    country_index = metadata.schema.names.index("country")
    event_type_index = metadata.schema.names.index("event_type")
    for group_index in range(metadata.num_row_groups):
        group = metadata.row_group(group_index)
        assert group.num_rows == 5_000
        country = group.column(country_index)
        event_type = group.column(event_type_index)
        assert country.compression == "ZSTD"
        assert event_type.compression == "ZSTD"
        assert "RLE_DICTIONARY" in country.encodings
        assert "RLE_DICTIONARY" in event_type.encodings
        assert country.statistics.has_min_max
        assert country.statistics.min == "DE"
        assert country.statistics.max == "US"

    layout = parquet_layout(parquet_path)
    assert layout["rows"] == 40_000
    assert layout["row_groups"] == 8
    assert layout["compression"] == "ZSTD"
    assert "RLE_DICTIONARY" in layout["country_encodings"]
    assert "RLE_DICTIONARY" in layout["event_type_encodings"]
    assert layout["country_statistics"] == [
        {"min": "DE", "max": "US"} for _ in range(8)
    ]
    assert parquet_path.stat().st_size < row_path.stat().st_size

print("PASS: Parquet projection, predicate pushdown metadata, and column encoding")
