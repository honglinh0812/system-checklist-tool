from datetime import datetime, timedelta
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from . import db

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(10), nullable=False)  # admin, user, viewer
    status = db.Column(db.String(20), default='active', nullable=False)  # pending, active
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_default_account = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    pending_expires_at = db.Column(db.DateTime, nullable=True)  # Expiry for pending status
    
    # Relationships
    created_mops = db.relationship('MOP', backref='creator', foreign_keys='MOP.created_by')
    approved_mops = db.relationship('MOP', backref='approver', foreign_keys='MOP.approved_by')
    reviews = db.relationship('MOPReview', backref='approver')
    executions = db.relationship('ExecutionHistory', foreign_keys='ExecutionHistory.executed_by', backref='user', overlaps="executed_by_user")
    legacy_executions = db.relationship('ExecutionHistory', foreign_keys='ExecutionHistory.user_id', backref='legacy_user')
    
    def __init__(self, username, password, role='viewer', email=None, full_name=None, status='pending'):
        self.username = username
        self.set_password(password)
        self.role = role
        self.email = email
        self.full_name = full_name
        self.status = status
        
        # Set pending expiry to 7 days from now for new registrations
        if status == 'pending':
            self.pending_expires_at = datetime.utcnow() + timedelta(days=7)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def is_admin(self):
        return self.role == 'admin'
    
    def is_user(self):
        return self.role == 'user'
    
    def is_viewer(self):
        return self.role == 'viewer'
    
    def is_pending(self):
        return self.status == 'pending'
    
    def is_pending_expired(self):
        """Check if pending status has expired"""
        if self.status == 'pending' and self.pending_expires_at:
            return datetime.utcnow() > self.pending_expires_at
        return False
    
    def approve_user(self):
        """Approve pending user and upgrade to user role"""
        if self.status == 'pending':
            self.status = 'active'
            self.role = 'user'
            self.pending_expires_at = None
    
    def reject_user(self):
        """Reject pending user, keep as viewer"""
        if self.status == 'pending':
            self.status = 'active'
            self.role = 'viewer'
            self.pending_expires_at = None
    
    def can_access_dashboard(self):
        return self.role in ['admin', 'user', 'viewer']
    
    def can_access_audit_logs(self):
        return self.role in ['admin', 'viewer']
    
    def can_access_execution_history(self):
        return self.role in ['admin', 'user', 'viewer']
    
    def can_manage_users(self):
        return self.role == 'admin'
    
    def can_view_users(self):
        return self.role in ['admin', 'user' ,'viewer']
    
    def can_manage_mops(self):
        return self.role in ['admin']
    
    def can_view_mops(self):
        return self.role in ['admin', 'user', 'viewer']
    
    def can_execute_mops(self):
        return self.role in ['admin', 'user']
        
    def __repr__(self):
        return f'<User {self.username}>'
