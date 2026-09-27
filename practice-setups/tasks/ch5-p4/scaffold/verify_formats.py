import io
import json
from pathlib import Path

import avro.io
import avro.schema
import item_pb2
import msgpack

from formats import FORMAT_NAMES, decode_all, encode_all, load_record, main

record = load_record()
payloads = encode_all(record)

assert set(payloads) == set(FORMAT_NAMES)
assert all(type(payload) is bytes and payload for payload in payloads.values())
decoded = decode_all(payloads)
assert set(decoded) == set(FORMAT_NAMES)
assert all(value == record for value in decoded.values())

independently_decoded = {
    "json": json.loads(payloads["json"].decode("utf-8")),
    "messagepack": msgpack.unpackb(payloads["messagepack"], raw=False),
}
protobuf_item = item_pb2.Item()
protobuf_item.ParseFromString(payloads["protobuf"])
independently_decoded["protobuf"] = {
    "itemName": protobuf_item.item_name,
    "quantity": protobuf_item.quantity,
    "colors": list(protobuf_item.colors),
}
avro_schema = avro.schema.parse(Path("item.avsc").read_text(encoding="utf-8"))
independently_decoded["avro"] = avro.io.DatumReader(avro_schema).read(
    avro.io.BinaryDecoder(io.BytesIO(payloads["avro"]))
)
assert set(independently_decoded) == set(FORMAT_NAMES)
assert all(value == record for value in independently_decoded.values())

main()
for name in FORMAT_NAMES:
    assert Path("encoded", f"item.{name}.bin").read_bytes() == payloads[name]

print("all format checks passed")
