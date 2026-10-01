"""External batch job: export real database rows to CSV, then signal completion."""
import asyncio
import csv
import os
from pathlib import Path
import sys

import psycopg
from temporalio.client import Client


async def main(export_id):
    folder = Path('artifacts')
    folder.mkdir(exist_ok=True)
    # IDs are supplied by the lab driver, not used as filesystem paths.
    import hashlib
    target = folder / (hashlib.sha256(export_id.encode()).hexdigest() + '.csv')
    with psycopg.connect(os.environ['DATABASE_URL']) as db:
        assert db.execute('SELECT 1 FROM export_jobs WHERE export_id=%s', (export_id,)).fetchone(), 'Job not requested'
        rows = db.execute('SELECT id, title FROM media_assets ORDER BY id').fetchall()
        with target.open('w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'title'])
            writer.writerows(rows)
        db.execute("UPDATE export_jobs SET status='done', artifact_path=%s WHERE export_id=%s", (str(target), export_id))
    client = await Client.connect(os.environ['TEMPORAL_ADDRESS'])
    await client.get_workflow_handle(export_id).signal('export_completed', export_id)
    print(f'Exported {len(rows)} rows to {target}', flush=True)


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1]))
