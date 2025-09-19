#!/usr/bin/env python3
"""
Script to create default admin user for System Checklist Tool
"""

import os
import sys
from datetime import datetime

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import app, db
from models.user import User

def create_admin_user():
    """Create default admin user"""
    with app.app_context():
        # Check if admin user already exists
        admin_user = User.query.filter_by(username='admin').first()
        
        if admin_user:
            print("Admin user already exists!")
            print(f"Username: {admin_user.username}")
            print(f"Role: {admin_user.role}")
            print(f"Created: {admin_user.created_at}")
            return
        
        # Create admin user per requirement: username=admin, password=admin
        admin = User(
            username='admin',
            password='admin123',
            email='admin@example.com',
            full_name='System Administrator',
            role='admin'
        )
        
        try:
            db.session.add(admin)
            db.session.commit()
            
            print("✅ Admin user created successfully!")
            print(f"Username: {admin.username}")
            print(f"Password: admin")
            print(f"Role: {admin.role}")
            print(f"Created: {admin.created_at}")
            print("\n⚠️  IMPORTANT: Change the default password in production!")
            
        except Exception as e:
            print(f"❌ Error creating admin user: {str(e)}")
            db.session.rollback()
            return False
    
    return True

def create_sample_users():
    """Create sample users for testing"""
    with app.app_context():
        sample_users = [
            {
                'username': 'suser',
                'password': 'user',
                'role': 'user'
            }
        ]
        
        created_count = 0
        for user_data in sample_users:
            # Check if user already exists
            existing_user = User.query.filter_by(username=user_data['username']).first()
            if existing_user:
                print(f"User {user_data['username']} already exists, skipping...")
                continue
            
            user = User(
                username=user_data['username'],
                password=user_data['password'],
                role=user_data['role']
            )
            
            try:
                db.session.add(user)
                db.session.commit()
                created_count += 1
                print(f"✅ Created user: {user_data['username']} ({user_data['role']})")
            except Exception as e:
                print(f"❌ Error creating user {user_data['username']}: {str(e)}")
                db.session.rollback()
        
        if created_count > 0:
            print(f"\n✅ Created {created_count} sample users")
        else:
            print("\nℹ️  All sample users already exist")

def list_users():
    """List all users in the system"""
    with app.app_context():
        users = User.query.all()
        
        if not users:
            print("No users found in the system")
            return
        
        print("\n📋 Current Users:")
        print("-" * 50)
        print(f"{'Username':<15} {'Role':<10} {'Created':<20}")
        print("-" * 50)
        
        for user in users:
            created = user.created_at.strftime('%Y-%m-%d %H:%M') if user.created_at else 'N/A'
            print(f"{user.username:<15} {user.role:<10} {created:<20}")

def reset_admin_password():
    """Reset admin password"""
    with app.app_context():
        admin_user = User.query.filter_by(username='admin').first()
        
        if not admin_user:
            print("❌ Admin user not found!")
            return False
        
        # Reset password to required default (minimum 6 characters)
        admin_user.set_password('admin123')
        db.session.commit()
        
        print("✅ Admin password reset successfully!")
        print(f"Username: {admin_user.username}")
        print(f"New Password: admin123")
        print("\n⚠️  IMPORTANT: Change the password after login!")
        
        return True

def main():
    """Main function"""
    print("🚀 System Checklist Tool - User Management")
    print("=" * 50)
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == 'create-admin':
            create_admin_user()
        elif command == 'create-sample':
            create_sample_users()
        elif command == 'list':
            list_users()
        elif command == 'reset-admin':
            reset_admin_password()
        elif command == 'create-all':
            create_admin_user()
            create_sample_users()
            list_users()
        else:
            print(f"❌ Unknown command: {command}")
            print_usage()
    else:
        print_usage()

def print_usage():
    """Print usage information"""
    print("\nUsage:")
    print("  python3 create_admin.py create-admin    - Create admin user")
    print("  python3 create_admin.py create-sample   - Create sample users")
    print("  python3 create_admin.py create-all      - Create admin and sample users")
    print("  python3 create_admin.py list            - List all users")
    print("  python3 create_admin.py reset-admin     - Reset admin password")
    print("\nExamples:")
    print("  python3 create_admin.py create-all")

if __name__ == '__main__':
    main()
