from pathlib import Path

from rocksdict import Options, Rdict, WriteBatch


def open_catalog(path: Path) -> Rdict:
    # TODO: open a raw-mode RocksDB database
    raise NotImplementedError


def write_catalog(db: Rdict, rows: list[tuple[str, str]]) -> None:
    # TODO: batch writes and flush
    raise NotImplementedError


def find_sku(db: Rdict, sku: str) -> str | None:
    # TODO: point lookup
    raise NotImplementedError


def scan_skus(db: Rdict, start: str, stop: str) -> list[tuple[str, str]]:
    # TODO: bounded ordered scan
    raise NotImplementedError
