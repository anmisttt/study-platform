import asyncio
from pathlib import Path

from temporalio.client import WorkflowHistory
from temporalio.worker import Replayer

from workflows import MediaExport


async def main():
    paths = sorted(Path('histories').glob('*.json'))
    assert paths, 'Run verify.py first'
    for path in paths:
        await Replayer(workflows=[MediaExport]).replay_workflow(WorkflowHistory.from_json(path.stem, path.read_text()))
        print(f'PASS replay {path}')


if __name__ == '__main__':
    asyncio.run(main())
