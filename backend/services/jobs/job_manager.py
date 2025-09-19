"""
Job Manager - Handles fallback between Redis queue and synchronous execution
"""
import logging
from typing import Dict, Any, Optional, Callable
from datetime import datetime, timezone, timedelta
from redis.exceptions import ConnectionError, TimeoutError
from rq.exceptions import NoSuchJobError
from .queue import get_redis_connection, get_queue
from .tasks import run_assessment_task

logger = logging.getLogger(__name__)

class JobManager:
    """
    Manages job execution with automatic fallback:
    - Try Redis queue first if available
    - Fall back to synchronous execution if Redis unavailable
    """
    
    def __init__(self):
        self._redis_available = None
        self._last_redis_check = None
        self._redis_check_interval = 30  # seconds
    
    def _check_redis_availability(self) -> bool:
        """Check if Redis is available and cache result for performance"""
        now = datetime.now()
        
        # Use cached result if recent
        if (self._last_redis_check and 
            (now - self._last_redis_check).seconds < self._redis_check_interval):
            return self._redis_available
        
        try:
            redis_conn = get_redis_connection()
            redis_conn.ping()
            self._redis_available = True
            logger.info("Redis connection successful")
        except (ConnectionError, TimeoutError, Exception) as e:
            self._redis_available = False
            logger.warning(f"Redis unavailable: {e}")
        
        self._last_redis_check = now
        return self._redis_available
    
    def enqueue_assessment(self, assessment_id: int, mop_id: int, servers: list, 
                          assessment_label: str) -> Dict[str, Any]:
        """
        Enqueue assessment job with automatic fallback
        Returns: {'job_id': str, 'mode': 'async'|'sync', 'status': 'queued'|'completed'|'failed'}
        """
        if self._check_redis_availability():
            try:
                # Try Redis queue
                queue = get_queue()
                job = queue.enqueue(
                    run_assessment_task,
                    assessment_id,
                    mop_id,
                    servers,
                    assessment_label,
                    job_timeout=60 * 60  # 1 hour timeout
                )
                logger.info(f"Job {job.id} enqueued to Redis queue")
                return {
                    'job_id': job.id,
                    'mode': 'async',
                    'status': 'queued'
                }
            except Exception as e:
                logger.error(f"Failed to enqueue to Redis: {e}")
                # Mark Redis as unavailable and fall through to sync execution
                self._redis_available = False
        
        # Fallback to synchronous execution
        logger.info("Executing assessment synchronously (Redis unavailable)")
        try:
            result = run_assessment_task(assessment_id, mop_id, servers, assessment_label)
            # Generate a pseudo job_id for consistency
            job_id = f"sync_{assessment_label.lower()}_{assessment_id}_{datetime.now().strftime('%H%M%S_%d%m%Y')}"
            
            return {
                'job_id': job_id,
                'mode': 'sync',
                'status': 'completed' if result.get('status') == 'success' else 'failed',
                'result': result
            }
        except Exception as e:
            logger.error(f"Synchronous execution failed: {e}")
            job_id = f"sync_{assessment_label.lower()}_{assessment_id}_{datetime.now().strftime('%H%M%S_%d%m%Y')}"
            return {
                'job_id': job_id,
                'mode': 'sync',
                'status': 'failed',
                'error': str(e)
            }
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get job status with fallback handling
        Returns: {'status': str, 'progress': int, 'result': dict, 'mode': str}
        """
        # Check if it's a sync job
        if job_id.startswith('sync_'):
            return {
                'status': 'completed',
                'progress': 100,
                'mode': 'sync',
                'message': 'Synchronous execution completed'
            }
        
        # Try Redis queue first
        if self._check_redis_availability():
            try:
                queue = get_queue()
                job = queue.fetch_job(job_id)
                
                if job is None:
                    # Job not found in Redis, try AnsibleRunner for detailed progress
                    return self._get_ansible_job_status(job_id)
                
                # Map RQ job status to our status
                status_map = {
                    'queued': 'queued',
                    'started': 'running',
                    'finished': 'completed',
                    'failed': 'failed',
                    'deferred': 'queued',
                    'canceled': 'failed'
                }
                
                status = status_map.get(job.get_status(), 'unknown')
                progress = 0
                
                # Get detailed progress from AnsibleRunner if job is running
                result = {
                    'status': status,
                    'progress': progress,
                    'mode': 'async'
                }
                
                if status == 'running':
                    # Try to get detailed progress from AnsibleRunner
                    ansible_status = self._get_ansible_job_status(job_id)
                    if ansible_status and ansible_status.get('detailed_progress'):
                        result['detailed_progress'] = ansible_status['detailed_progress']
                        result['progress'] = ansible_status.get('progress', 50)
                    else:
                        result['progress'] = 50  # Default when running
                elif status == 'completed':
                    result['progress'] = 100
                
                if job.result:
                    result['result'] = job.result
                
                if job.exc_info:
                    result['error'] = str(job.exc_info)
                
                return result
                
            except (NoSuchJobError, Exception) as e:
                logger.error(f"Error fetching job {job_id}: {e}")
                # Fallback to AnsibleRunner
                return self._get_ansible_job_status(job_id)
        
        # Redis unavailable, try AnsibleRunner
        return self._get_ansible_job_status(job_id)
    
    def _get_ansible_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get job status from AnsibleRunner as fallback"""
        try:
            from services.ansible_manager import AnsibleRunner
            ansible_runner = AnsibleRunner()
            ansible_status = ansible_runner.get_job_status(job_id)
            
            if ansible_status:
                return {
                    'status': ansible_status.get('status', 'unknown'),
                    'progress': ansible_status.get('progress', 0),
                    'detailed_progress': ansible_status.get('detailed_progress'),
                    'mode': 'ansible_fallback'
                }
            else:
                return {
                    'status': 'not_found',
                    'progress': 0,
                    'mode': 'unknown',
                    'error': 'Job not found in Redis or AnsibleRunner'
                }
        except Exception as e:
            logger.error(f"Error getting status from AnsibleRunner: {e}")
            return {
                'status': 'error',
                'progress': 0,
                'mode': 'unknown',
                'error': f'Failed to get status: {str(e)}'
            }
    
    def is_redis_available(self) -> bool:
        """Public method to check Redis availability"""
        return self._check_redis_availability()

# Global instance
job_manager = JobManager()