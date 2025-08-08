#!/usr/bin/env python3
"""
Script to initialize default data for the system
"""

from app import create_app
from models import db
from models.user import User

def init_default_users():
    """Initialize default admin and user accounts"""
    app = create_app()
    
    with app.app_context():
        # Check if users already exist
        admin_user = User.query.filter_by(username='admin').first()
        if not admin_user:
            admin_user = User(username='admin', password='admin', role='admin')
            db.session.add(admin_user)
            print("Created admin user: admin/admin")
        else:
            print("Admin user already exists")
        
        regular_user = User.query.filter_by(username='suser').first()
        if not regular_user:
            regular_user = User(username='suser', password='user', role='user')
            db.session.add(regular_user)
            print("Created regular user: suser/user")
        else:
            print("Regular user already exists")
        
        try:
            db.session.commit()
            print("Database initialization completed successfully!")
        except Exception as e:
            db.session.rollback()
            print(f"Error initializing database: {e}")

if __name__ == '__main__':
    init_default_users()
