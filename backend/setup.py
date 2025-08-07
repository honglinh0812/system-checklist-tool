#!/usr/bin/env python3
"""
Setup script for System Checklist Tool
"""

import os
import sys
import subprocess

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed: {e}")
        print(f"Error output: {e.stderr}")
        return False

def create_directories():
    """Create necessary directories"""
    directories = ['logs', 'uploads', 'templates']
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        print(f"✅ Created directory: {directory}")

def create_template():
    """Create Excel templates"""
    print("🔄 Creating Excel templates...")
    try:
        from create_template import create_excel_template
        create_excel_template()
        print("✅ Excel template v1 created successfully")
        
        from create_template_v2 import create_excel_template_v2
        create_excel_template_v2()
        print("✅ Excel template v2 created successfully")
    except Exception as e:
        print(f"❌ Failed to create templates: {e}")
        return False
    return True

def install_dependencies():
    """Install Python dependencies"""
    return run_command("pip install -r requirements.txt", "Installing Python dependencies")

def main():
    print("🚀 Setting up System Checklist Tool...")
    
    # Create directories
    create_directories()
    
    # Install dependencies
    if not install_dependencies():
        print("❌ Failed to install dependencies")
        sys.exit(1)
    
    # Create template
    if not create_template():
        print("❌ Failed to create template")
        sys.exit(1)
    
    print("✅ Setup completed successfully!")
    print("\n📋 Next steps:")
    print("1. Run: python3 app.py")
    print("2. Open: http://localhost:5000")
    print("3. Or use: ./start.sh to run both frontend and backend")

if __name__ == "__main__":
    main() 