#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quick Start Script for Flask Production Optimization
Automatically sets up and tests the optimized Flask application
"""

import os
import sys
import time
import subprocess
import requests
from pathlib import Path

class QuickStart:
    def __init__(self):
        # Script hiện ở trong thư mục scripts, cần lên 1 cấp để về project root
        self.project_root = Path(__file__).parent.parent
        self.backend_dir = self.project_root / "backend"
        
    def print_banner(self):
        """Print welcome banner"""
        print("="*70)
        print("🚀 Flask Production Optimization - Quick Start")
        print("="*70)
        print("This script will help you set up and test the optimized Flask app")
        print()
        
    def check_requirements(self):
        """Check if all requirements are installed"""
        print("📋 Checking requirements...")
        
        # Check Python version
        if sys.version_info < (3, 8):
            print("❌ Python 3.8+ is required")
            return False
            
        # Check if requirements.txt exists
        req_file = self.backend_dir / "requirements.txt"
        if not req_file.exists():
            print("❌ requirements.txt not found in backend directory")
            return False
            
        # Check if virtual environment is recommended
        if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
            print("⚠️  Virtual environment recommended but not detected")
            response = input("Continue anyway? (y/N): ")
            if response.lower() != 'y':
                return False
                
        print("✅ Requirements check passed")
        return True
        
    def install_dependencies(self):
        """Install Python dependencies"""
        print("📦 Installing dependencies...")
        
        try:
            subprocess.run([
                sys.executable, "-m", "pip", "install", "-r", 
                str(self.backend_dir / "requirements.txt")
            ], check=True, capture_output=True)
            print("✅ Dependencies installed successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to install dependencies: {e}")
            return False
            
    def setup_environment(self):
        """Set up environment variables"""
        print("🔧 Setting up environment...")
        
        env_file = self.project_root / ".env.production"
        if not env_file.exists():
            print("❌ .env.production file not found")
            return False
            
        # Load environment variables
        with open(env_file, 'r') as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value
                    
        print("✅ Environment variables loaded")
        return True
        
    def start_server(self):
        """Start the production server"""
        print("🚀 Starting production server...")
        
        try:
            # Start server using start_production.py
            result = subprocess.run([
                sys.executable, "start_production.py", "start"
            ], capture_output=True, text=True, timeout=10)
            
            if "Server started successfully" in result.stdout:
                print("✅ Production server started")
                return True
            else:
                print(f"❌ Failed to start server: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            # Server might be starting in background
            print("⏳ Server is starting in background...")
            return True
        except Exception as e:
            print(f"❌ Error starting server: {e}")
            return False
            
    def wait_for_server(self, max_wait=30):
        """Wait for server to be ready"""
        print("⏳ Waiting for server to be ready...")
        
        start_time = time.time()
        while time.time() - start_time < max_wait:
            try:
                response = requests.get("http://localhost:5000/api/health", timeout=2)
                if response.status_code == 200:
                    print("✅ Server is ready!")
                    return True
            except:
                pass
                
            time.sleep(2)
            print(".", end="", flush=True)
            
        print("\n❌ Server did not start within timeout")
        return False
        
    def run_performance_test(self):
        """Run performance test"""
        print("\n📊 Running performance test...")
        
        try:
            result = subprocess.run([
                sys.executable, "performance_test.py"
            ], capture_output=True, text=True, timeout=120)
            
            print(result.stdout)
            if result.stderr:
                print("Warnings:", result.stderr)
                
            return True
        except subprocess.TimeoutExpired:
            print("❌ Performance test timed out")
            return False
        except Exception as e:
            print(f"❌ Error running performance test: {e}")
            return False
            
    def show_next_steps(self):
        """Show next steps to user"""
        print("\n🎉 Setup completed successfully!")
        print("\n📋 Next Steps:")
        print("1. Server is running at: http://localhost:5000")
        print("2. Health check: http://localhost:5000/api/health")
        print("3. Monitor with: python monitor.py")
        print("4. View logs: tail -f logs/gunicorn.log")
        print("5. Stop server: python start_production.py stop")
        print("- Configuration: .env.production")
        print("- Backup: python backup.py --help")
        
    def run(self):
        """Run the complete setup process"""
        self.print_banner()
        
        # Step 1: Check requirements
        if not self.check_requirements():
            return False
            
        # Step 2: Install dependencies
        if not self.install_dependencies():
            return False
            
        # Step 3: Setup environment
        if not self.setup_environment():
            return False
            
        # Step 4: Start server
        if not self.start_server():
            return False
            
        # Step 5: Wait for server
        if not self.wait_for_server():
            return False
            
        # Step 6: Run performance test
        self.run_performance_test()
        
        # Step 7: Show next steps
        self.show_next_steps()
        
        return True

def main():
    """Main function"""
    quick_start = QuickStart()
    
    try:
        success = quick_start.run()
        if success:
            print("\n✅ Quick start completed successfully!")
        else:
            print("\n❌ Quick start failed. Please check the errors above.")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()