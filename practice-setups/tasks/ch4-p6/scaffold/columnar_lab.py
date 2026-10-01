import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


def build_events(count: int = 40_000) -> pa.Table:
    countries = ("DE", "US", "GE", "FR")
    event_types = ("view", "click", "purchase")
    return pa.table(
        {
            "event_id": range(count),
            "user_id": [number % 5_000 for number in range(count)],
            "country": [countries[number % len(countries)] for number in range(count)],
            "event_type": [event_types[number % len(event_types)] for number in range(count)],
            "revenue": [19.99 if number % 11 == 0 else 0.0 for number in range(count)],
            "payload": [f"campaign-{number % 20}:landing-page-{number % 50}" for number in range(count)],
        }
    )


def write_row_file(table: pa.Table, path: Path) -> None:
    # TODO: write complete rows as newline-delimited JSON
    raise NotImplementedError


def write_parquet(table: pa.Table, path: Path) -> None:
    # TODO: write compressed column chunks, dictionaries, row groups, and statistics
    raise NotImplementedError


def scan_country_revenue(path: Path, country: str) -> pa.Table:
    # TODO: read only user_id and revenue while pushing down the country filter
    raise NotImplementedError


def parquet_layout(path: Path) -> dict[str, object]:
    # TODO: report rows, row groups, compression, encodings, and country min/max statistics
    raise NotImplementedError
