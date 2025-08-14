from datetime import datetime
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
    role = db.Column(db.String(10), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_default_account = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    created_mops = db.relationship('MOP', backref='creator', foreign_keys='MOP.created_by')
    approved_mops = db.relationship('MOP', backref='approver', foreign_keys='MOP.approved_by')
    reviews = db.relationship('MOPReview', backref='approver')
    executions = db.relationship('ExecutionHistory', foreign_keys='ExecutionHistory.executed_by', backref='user', overlaps="executed_by_user")
    legacy_executions = db.relationship('ExecutionHistory', foreign_keys='ExecutionHistory.user_id', backref='legacy_user')
    
    def __init__(self, username, password, role='user', email=None, full_name=None):
        self.username = username
        self.set_password(password)
        self.role = role
        self.email = email
        self.full_name = full_name
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def is_admin(self):
        return self.role == 'admin'
        
    def __repr__(self):
        return f'<User {self.username}>'
