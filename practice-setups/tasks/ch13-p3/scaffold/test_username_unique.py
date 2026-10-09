import json
import time
import uuid

from kafka import KafkaConsumer

import ch13_username_unique as lab


suffix = uuid.uuid4().hex
lab.TOPIC_CLAIMS = f"uname.claims.test.{suffix}"
lab.TOPIC_DECISIONS = f"uname.decisions.test.{suffix}"
lab.ensure_topics()

taken: dict[str, str] = {}
lab.decide(taken, {"request_id": "r1", "username": "neo"})
lab.decide(taken, {"request_id": "r2", "username": "neo"})
assert taken == {"neo": "r1"}

claims = [("r1", "neo"), ("r2", "neo"), ("r3", "trinity")]
lab.publish_claims(claims)
decisions = lab.run_enforcer(expected=len(claims), timeout_s=15)
expected = {
    "r1": {"request_id": "r1", "username": "neo", "status": "accepted"},
    "r2": {"request_id": "r2", "username": "neo", "status": "rejected"},
    "r3": {"request_id": "r3", "username": "trinity", "status": "accepted"},
}
assert {decision["request_id"]: decision for decision in decisions} == expected

consumer = KafkaConsumer(
    lab.TOPIC_DECISIONS,
    bootstrap_servers=lab.BOOTSTRAP,
    group_id=f"verify-{suffix}",
    auto_offset_reset="earliest",
    enable_auto_commit=False,
    consumer_timeout_ms=10_000,
    value_deserializer=lambda value: json.loads(value.decode()),
)
emitted = []
for record in consumer:
    emitted.append(record)
    if len(emitted) == len(expected):
        break
consumer.close()
assert {record.value["request_id"]: record.value for record in emitted} == expected
assert all(record.key.decode() == record.value["username"] for record in emitted)

underfilled_suffix = uuid.uuid4().hex
lab.TOPIC_CLAIMS = f"uname.claims.test.{underfilled_suffix}"
lab.TOPIC_DECISIONS = f"uname.decisions.test.{underfilled_suffix}"
lab.ensure_topics()
lab.publish_claims([("r4", "morpheus")])
started = time.monotonic()
underfilled = lab.run_enforcer(expected=2, timeout_s=1)
elapsed = time.monotonic() - started
assert underfilled == [
    {"request_id": "r4", "username": "morpheus", "status": "accepted"}
]
assert 0.8 <= elapsed < 4
print("ok")
