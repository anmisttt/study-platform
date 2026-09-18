import tempfile
from pathlib import Path

from rocksdict import Options, Rdict, WriteBatch

from catalog_rocksdb import find_sku, open_catalog, scan_skus, write_catalog


class RecordingDb:
    def __init__(self, db: Rdict) -> None:
        self.db = db
        self.writes = []

    def write(self, batch: WriteBatch) -> None:
        self.writes.append(batch)
        self.db.write(batch)

    def __getattr__(self, name: str):
        return getattr(self.db, name)


with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / "catalog-db"
    db = open_catalog(path)
    recording_db = RecordingDb(db)
    write_catalog(recording_db, [
        ("sku:104", "keyboard-v1"),
        ("sku:101", "mouse"),
        ("sku:103", "cable"),
        ("sku:102", "stand"),
        ("sku:104", "keyboard-v2"),
        ("sku:105", "dock"),
    ])

    assert len(recording_db.writes) == 1
    assert isinstance(recording_db.writes[0], WriteBatch)
    assert db.live_files()
    assert find_sku(db, "sku:101") == "mouse"
    assert find_sku(db, "sku:104") == "keyboard-v2"
    assert find_sku(db, "sku:999") is None
    assert scan_skus(db, "sku:102", "sku:105") == [
        ("sku:102", "stand"),
        ("sku:103", "cable"),
        ("sku:104", "keyboard-v2"),
    ]

    write_catalog(db, [("sku:104", "keyboard-v3")])
    db.close()

    raw_db = Rdict(str(path), Options(raw_mode=True))
    assert raw_db.get(b"sku:101") == b"mouse"
    assert raw_db.get(b"sku:104") == b"keyboard-v3"
    raw_db.close()

    db = open_catalog(path)
    assert find_sku(db, "sku:104") == "keyboard-v3"
    assert scan_skus(db, "sku:104", "sku:106") == [
        ("sku:104", "keyboard-v3"),
        ("sku:105", "dock"),
    ]
    db.close()

print("PASS: native SST flush, point reads, range scans, and reopen")
