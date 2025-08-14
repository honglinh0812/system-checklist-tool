#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Production Startup Script for System Checklist Tool
Optimized Flask + Gunicorn configuration
"""

import os
import sys
import subprocess
import signal
import time
from pathlib import Path

# Add backend to Python path
# Script hiện ở trong thư mục scripts, cần lên 1 cấp để về project root
project_root = Path(__file__).parent.parent
backend_path = project_root / 'backend'
sys.path.insert(0, str(backend_path))

class ProductionServer:
    def __init__(self):
        # Script hiện ở trong thư mục scripts, cần lên 1 cấp để về project root
        self.project_root = Path(__file__).parent.parent
        self.backend_dir = self.project_root / 'backend'
        self.logs_dir = self.project_root / 'logs'
        self.gunicorn_config = self.project_root / 'gunicorn.conf.py'
        self.pidfile = '/tmp/gunicorn_system_checklist.pid'
        
        # Ensure directories exist
        self.logs_dir.mkdir(exist_ok=True)
        
    def setup_environment(self):
        """Setup production environment variables"""
        os.environ['FLASK_ENV'] = 'production'
        os.environ['PYTHONPATH'] = str(self.backend_dir)
        
        # Set production database URL if not already set
        if not os.environ.get('DATABASE_URL'):
            print("⚠️  Warning: DATABASE_URL not set, using default PostgreSQL connection")
            
        # Set secret key if not already set
        if not os.environ.get('SECRET_KEY'):
            print("⚠️  Warning: SECRET_KEY not set, using default (change in production!)")
            
    def check_dependencies(self):
        """Check if all required dependencies are installed"""
        try:
            import gunicorn
            print(f"✅ Gunicorn version: {gunicorn.__version__}")
        except ImportError:
            print("❌ Gunicorn not installed. Run: pip install gunicorn")
            return False
            
        try:
            from backend.app import app
            print("✅ Flask application loaded successfully")
        except ImportError as e:
            print(f"❌ Failed to import Flask app: {e}")
            return False
            
        return True
        
    def start_server(self):
        """Start the production server with Gunicorn"""
        if not self.check_dependencies():
            return False
            
        self.setup_environment()
        
        # Change to backend directory
        os.chdir(self.backend_dir)
        
        # Gunicorn command
        cmd = [
            'gunicorn',
            '--config', str(self.gunicorn_config),
            'app:app'
        ]
        
        print("🚀 Starting System Checklist Tool in production mode...")
        print(f"📁 Working directory: {self.backend_dir}")
        print(f"⚙️  Configuration: {self.gunicorn_config}")
        print(f"📝 Logs directory: {self.logs_dir}")
        print(f"🌐 Server will be available at: http://0.0.0.0:5000")
        print("\n" + "="*50)
        
        try:
            # Start Gunicorn
            process = subprocess.Popen(cmd)
            print(f"✅ Server started with PID: {process.pid}")
            
            # Wait for the process
            process.wait()
            
        except KeyboardInterrupt:
            print("\n🛑 Shutting down server...")
            self.stop_server()
        except Exception as e:
            print(f"❌ Error starting server: {e}")
            return False
            
        return True
        
    def stop_server(self):
        """Stop the production server"""
        if os.path.exists(self.pidfile):
            try:
                with open(self.pidfile, 'r') as f:
                    pid = int(f.read().strip())
                os.kill(pid, signal.SIGTERM)
                print(f"✅ Server stopped (PID: {pid})")
                
                # Wait for graceful shutdown
                time.sleep(2)
                
                # Force kill if still running
                try:
                    os.kill(pid, 0)  # Check if process exists
                    os.kill(pid, signal.SIGKILL)
                    print("🔥 Force killed server process")
                except ProcessLookupError:
                    pass  # Process already terminated
                    
            except (FileNotFoundError, ValueError, ProcessLookupError):
                print("⚠️  PID file not found or invalid")
        else:
            print("⚠️  Server PID file not found")
            
    def status(self):
        """Check server status"""
        if os.path.exists(self.pidfile):
            try:
                with open(self.pidfile, 'r') as f:
                    pid = int(f.read().strip())
                os.kill(pid, 0)  # Check if process exists
                print(f"✅ Server is running (PID: {pid})")
                return True
            except (FileNotFoundError, ValueError, ProcessLookupError):
                print("❌ Server is not running")
                return False
        else:
            print("❌ Server is not running")
            return False

def main():
    server = ProductionServer()
    
    if len(sys.argv) < 2:
        print("Usage: python start_production.py [start|stop|restart|status]")
        return
        
    command = sys.argv[1].lower()
    
    if command == 'start':
        server.start_server()
    elif command == 'stop':
        server.stop_server()
    elif command == 'restart':
        server.stop_server()
        time.sleep(2)
        server.start_server()
    elif command == 'status':
        server.status()
    else:
        print("Invalid command. Use: start|stop|restart|status")

if __name__ == '__main__':
    main()