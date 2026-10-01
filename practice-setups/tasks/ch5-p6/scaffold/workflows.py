from temporalio import workflow


@workflow.defn
class MediaExport:
    def __init__(self):
        self.completed_ids = set()

    @workflow.signal
    def export_completed(self, export_id: str):
        # TODO: remember the completion signal
        pass

    @workflow.run
    async def run(self, request: dict) -> str:
        # TODO: orchestrate export, completion wait, release time, publication
        raise NotImplementedError
