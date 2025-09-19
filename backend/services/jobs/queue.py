import os
from rq import Queue
from redis import Redis

def get_redis_connection() -> Redis:
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    # Allow URL or host/port
    if redis_url.startswith('redis://'):
        from redis import from_url
        return from_url(redis_url, 
                       socket_keepalive=True, 
                       socket_keepalive_options={}, 
                       socket_connect_timeout=60, 
                       socket_timeout=300,  # 5 minutes
                       retry_on_timeout=True,
                       health_check_interval=60)
    host = os.getenv('REDIS_HOST', 'localhost')
    port = int(os.getenv('REDIS_PORT', '6379'))
    db = int(os.getenv('REDIS_DB', '0'))
    return Redis(
        host=host, 
        port=port, 
        db=db,
        socket_keepalive=True,
        socket_keepalive_options={},
        socket_connect_timeout=60,
        socket_timeout=300,  # 5 minutes
        retry_on_timeout=True,
        health_check_interval=60,
        decode_responses=True,  # Auto decode responses
        max_connections=20  # Connection pool
    )

def get_queue(name: str = 'default') -> Queue:
    return Queue(name, connection=get_redis_connection(), default_timeout=60 * 60)


