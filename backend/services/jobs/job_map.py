from typing import Optional
from .queue import get_redis_connection

JOB_MAP_PREFIX = "job_map:"

def set_job_mapping(rq_job_id: str, ansible_job_id: str) -> None:
    """Store bidirectional mapping between RQ job ID and Ansible job ID in Redis."""
    conn = get_redis_connection()
    conn.set(f"{JOB_MAP_PREFIX}{rq_job_id}", ansible_job_id)
    conn.set(f"{JOB_MAP_PREFIX}{ansible_job_id}", rq_job_id)

def resolve_job_id(job_id: str) -> str:
    """Resolve a job_id to the canonical one known by AnsibleRunner if mapped."""
    try:
        conn = get_redis_connection()
        mapped = conn.get(f"{JOB_MAP_PREFIX}{job_id}")
        if mapped:
            try:
                # Redis may return bytes
                return mapped.decode("utf-8") if isinstance(mapped, (bytes, bytearray)) else str(mapped)
            except Exception:
                return job_id
        return job_id
    except Exception:
        # If Redis not available, return as-is
        return job_id


