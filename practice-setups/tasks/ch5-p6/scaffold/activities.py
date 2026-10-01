import os

import psycopg
from temporalio import activity


def connect():
    return psycopg.connect(os.environ['DATABASE_URL'])


@activity.defn
def request_export(export_id: str) -> None:
    # TODO: persist an idempotent export job
    raise NotImplementedError


def persist_publication(export_id: str, mode: str) -> None:
    # TODO: persist an idempotent publication for a completed export
    raise NotImplementedError


@activity.defn
def publish_export(export_id: str, mode: str) -> None:
    persist_publication(export_id, mode)
    # Inject failure after commit to exercise activity redelivery.
    if activity.info().attempt == 1:
        raise RuntimeError("Injected lost acknowledgement after database commit")
