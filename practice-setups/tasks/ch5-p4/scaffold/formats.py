from __future__ import annotations

import json
from pathlib import Path

import avro.io
import avro.schema
import item_pb2
import msgpack

FORMAT_NAMES = ("json", "messagepack", "protobuf", "avro")


def load_record(path: Path = Path("record.json")) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def encode_all(record: dict[str, object]) -> dict[str, bytes]:
    # TODO: encode all formats
    raise NotImplementedError


def decode_all(payloads: dict[str, bytes]) -> dict[str, dict[str, object]]:
    # TODO: decode all formats
    raise NotImplementedError


def main() -> None:
    record = load_record()
    payloads = encode_all(record)
    decoded = decode_all(payloads)
    output_dir = Path("encoded")
    output_dir.mkdir(exist_ok=True)
    for name in FORMAT_NAMES:
        (output_dir / f"item.{name}.bin").write_bytes(payloads[name])
        print(f"{name}: {len(payloads[name])} bytes decoded={decoded[name]}")


if __name__ == "__main__":
    main()
