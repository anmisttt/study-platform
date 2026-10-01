import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

from activities import request_export, publish_export
from workflows import MediaExport


async def main():
    client = await Client.connect(os.environ['TEMPORAL_ADDRESS'])
    with ThreadPoolExecutor(max_workers=4) as executor:
        async with Worker(
            client, task_queue=os.environ.get('TASK_QUEUE', 'media-exports'),
            workflows=[MediaExport], activities=[request_export, publish_export],
            activity_executor=executor,
        ):
            await asyncio.Event().wait()


if __name__ == '__main__':
    asyncio.run(main())
