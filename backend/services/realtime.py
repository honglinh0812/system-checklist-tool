from flask import Response, stream_with_context
from time import sleep
from typing import Iterator
from services.ansible_manager import AnsibleRunner
from services.jobs.job_map import resolve_job_id

runner = AnsibleRunner()

def sse_job_stream(job_id: str) -> Response:
    def event_stream() -> Iterator[str]:
        while True:
            # Resolve job_id if it is an RQ id mapped to Ansible id (or vice versa)
            resolved_id = resolve_job_id(job_id)
            status = runner.get_job_status(resolved_id) or {}
            logs = runner.get_job_logs(resolved_id) or {}
            payload = {
                'status': status.get('status', 'pending'),
                'progress': status.get('progress'),
                'detailed_progress': status.get('detailed_progress'),
                'last_updated': logs.get('last_updated')
            }
            import json
            yield f"data: {json.dumps(payload)}\n\n"
            if payload['status'] in ['completed', 'failed']:
                break
            sleep(2)

    return Response(stream_with_context(event_stream()), mimetype='text/event-stream')


