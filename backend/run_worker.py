#!/usr/bin/env python3
"""
RQ Worker script for assessment tasks
"""
import os
import sys
from flask import Flask
from services.jobs.queue import get_redis_connection
from rq import Worker, Queue

# Add the backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def create_app():
    """Create Flask app for worker context"""
    app = Flask(__name__)
    
    # Load configuration from config module
    from config.config import Config
    app.config.from_object(Config)
    
    # Ensure we use the same database as the main app
    if not app.config.get('SQLALCHEMY_DATABASE_URI'):
        app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('SQLALCHEMY_DATABASE_URI', 'postgresql://postgres:postgres@localhost/system_checklist')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialize database
    from models import db, init_db
    init_db(app)
    
    return app

def main():
    """Main worker function"""
    print("Starting RQ Worker...")
    
    # Create Flask app
    app = create_app()
    
    # Get Redis connection
    conn = get_redis_connection()
    
    # Create worker
    worker = Worker(['default'], connection=conn)
    
    print(f"Worker listening on queues: {worker.queue_names}")
    print("Press Ctrl+C to stop worker")
    
    # Start worker
    with app.app_context():
        worker.work()

if __name__ == '__main__':
    main()
