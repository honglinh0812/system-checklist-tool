import os
from rq import Worker
from .queue import get_redis_connection

def main():
    queues = os.getenv('RQ_QUEUES', 'default').split(',')
    conn = get_redis_connection()
    worker = Worker(queues, connection=conn)
    worker.work(with_scheduler=True)

if __name__ == '__main__':
    main()


