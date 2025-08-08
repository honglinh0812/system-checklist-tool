from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from . import db

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    created_mops = db.relationship('MOP', backref='creator', foreign_keys='MOP.created_by')
    approved_mops = db.relationship('MOP', backref='approver', foreign_keys='MOP.approved_by')
    reviews = db.relationship('MOPReview', backref='admin')
    executions = db.relationship('ExecutionHistory', backref='user')
    
    def __init__(self, username, password, role='user'):
        self.username = username
        self.set_password(password)
        self.role = role
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def is_admin(self):
        return self.role == 'admin'
        
    def __repr__(self):
        return f'<User {self.username}>'
