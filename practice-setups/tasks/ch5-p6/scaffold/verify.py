import asyncio
import csv
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import subprocess
import sys
import uuid

import psycopg
from temporalio.api.enums.v1 import EventType
from temporalio.client import Client
from temporalio.worker import Replayer

from activities import persist_publication, request_export
from workflows import MediaExport


def query(sql, args=()):
    with psycopg.connect(os.environ['DATABASE_URL']) as db:
        return db.execute(sql, args).fetchall()


def execute(sql, args=()):
    with psycopg.connect(os.environ['DATABASE_URL']) as db:
        db.execute(sql, args)


def verify_database_contract():
    completed_id = 'completed-' + uuid.uuid4().hex
    request_export(completed_id)
    artifact_path = 'artifacts/already-complete.csv'
    execute(
        "UPDATE export_jobs SET status='done', artifact_path=%s WHERE export_id=%s",
        (artifact_path, completed_id),
    )
    request_export(completed_id)
    assert query(
        'SELECT status, artifact_path FROM export_jobs WHERE export_id=%s',
        (completed_id,),
    ) == [('done', artifact_path)]

    queued_id = 'queued-' + uuid.uuid4().hex
    request_export(queued_id)
    try:
        persist_publication(queued_id, 'scheduled')
    except Exception:
        pass
    assert not query('SELECT 1 FROM publications WHERE export_id=%s', (queued_id,))

    persist_publication(completed_id, 'scheduled')
    original = query(
        'SELECT mode, published_at FROM publications WHERE export_id=%s',
        (completed_id,),
    )
    assert len(original) == 1 and original[0][0] == 'scheduled'
    persist_publication(completed_id, 'immediate')
    assert query(
        'SELECT mode, published_at FROM publications WHERE export_id=%s',
        (completed_id,),
    ) == original


def seconds(duration):
    return duration.seconds + duration.nanos / 1_000_000_000


async def eventually(check, message, seconds=30):
    try:
        async with asyncio.timeout(seconds):
            while not await check():
                await asyncio.sleep(0.1)
    except TimeoutError as exc:
        raise AssertionError(message) from exc


async def main():
    client = await Client.connect(os.environ['TEMPORAL_ADDRESS'])
    verify_database_contract()
    queue = 'verify-' + uuid.uuid4().hex
    log = open('worker.log', 'w')
    process = None

    def start():
        return subprocess.Popen([sys.executable, 'worker.py'], env={**os.environ, 'TASK_QUEUE': queue}, stdout=log, stderr=log)

    def stop():
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=10)

    try:
        process = start()
        for mode in ('scheduled', 'immediate'):
            export_id = mode + '-' + uuid.uuid4().hex
            release_at = datetime.now(timezone.utc) + timedelta(seconds=15 if mode == 'scheduled' else 3)
            handle = await client.start_workflow(
                MediaExport.run,
                {'export_id': export_id, 'release_at': release_at.isoformat()},
                id=export_id, task_queue=queue,
            )

            async def job_exists():
                return bool(query('SELECT 1 FROM export_jobs WHERE export_id=%s', (export_id,)))

            await eventually(job_exists, 'Job was not persisted; inspect worker.log')

            await handle.signal('export_completed', 'unrelated-' + uuid.uuid4().hex)

            async def unrelated_signal_processed():
                events = (await handle.fetch_history()).events
                signals = [e for e in events if e.event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED]
                if not signals:
                    return False
                signal_id = signals[-1].event_id
                return any(
                    e.event_type == EventType.EVENT_TYPE_WORKFLOW_TASK_COMPLETED
                    and e.workflow_task_completed_event_attributes.started_event_id > signal_id
                    for e in events
                )

            await eventually(unrelated_signal_processed, 'Worker did not process the unrelated completion signal')
            blocked_history = await handle.fetch_history()
            assert not any(e.event_type == EventType.EVENT_TYPE_TIMER_STARTED for e in blocked_history.events)
            assert not any(e.event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED for e in blocked_history.events)
            assert not query('SELECT 1 FROM publications WHERE export_id=%s', (export_id,))
            if mode == 'immediate':
                stop()
                await asyncio.sleep(max(0, (release_at - datetime.now(timezone.utc)).total_seconds()) + 1)

            job = await asyncio.create_subprocess_exec(sys.executable, 'export_job.py', export_id)
            assert await job.wait() == 0
            # Completion can be redelivered by the external job.
            await handle.signal('export_completed', export_id)

            if mode == 'scheduled':
                async def timer_exists():
                    return any(e.event_type == EventType.EVENT_TYPE_TIMER_STARTED for e in (await handle.fetch_history()).events)

                await eventually(timer_exists, 'No durable release timer', seconds=10)
                assert not query('SELECT 1 FROM publications WHERE export_id=%s', (export_id,))
                stop()
                await asyncio.sleep(max(0, (release_at - datetime.now(timezone.utc)).total_seconds()) + 1)

            process = start()
            result = await asyncio.wait_for(handle.result(), timeout=40)
            assert result == mode, (result, mode)
            rows = query('SELECT mode, published_at FROM publications WHERE export_id=%s', (export_id,))
            assert len(rows) == 1 and rows[0][0] == mode
            assert rows[0][1] >= release_at
            jobs = query('SELECT status, artifact_path FROM export_jobs WHERE export_id=%s', (export_id,))
            assert len(jobs) == 1 and jobs[0][0] == 'done'
            with open(jobs[0][1], newline='') as f:
                assert list(csv.reader(f)) == [['id', 'title'], ['1', 'Forest walk'], ['2', 'City lights'], ['3', 'Ocean morning']]
            history = await handle.fetch_history()
            publications = [e for e in history.events if e.event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED and e.activity_task_started_event_attributes.attempt >= 2]
            assert publications, 'The injected post-commit activity failure must retry'
            scheduled = {
                e.activity_task_scheduled_event_attributes.activity_type.name:
                    e.activity_task_scheduled_event_attributes
                for e in history.events
                if e.event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED
            }
            assert {'request_export', 'publish_export'} <= scheduled.keys()
            for name in ('request_export', 'publish_export'):
                attributes = scheduled[name]
                assert seconds(attributes.start_to_close_timeout) == 10
                assert seconds(attributes.retry_policy.initial_interval) == 1
                assert 2 <= attributes.retry_policy.maximum_attempts <= 3
            if mode == 'immediate':
                assert not any(e.event_type == EventType.EVENT_TYPE_TIMER_STARTED for e in history.events)
            Path('histories').mkdir(exist_ok=True)
            Path(f'histories/{export_id}.json').write_text(history.to_json())
            await Replayer(workflows=[MediaExport]).replay_workflow(history)
            print(f'PASS {mode}: database, external job, restart, retry, replay', flush=True)
    finally:
        stop()
        log.close()


if __name__ == '__main__':
    asyncio.run(main())
