from datetime import datetime
from . import db
from sqlalchemy.dialects.postgresql import ARRAY

class MOP(db.Model):
    __tablename__ = 'mops'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    # Use PostgreSQL-specific ARRAY to enable operators like contains/any
    type = db.Column(ARRAY(db.String(20)), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    approved_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    commands = db.relationship('Command', backref='mop', cascade='all, delete-orphan')
    files = db.relationship('MOPFile', backref='mop', cascade='all, delete-orphan')
    reviews = db.relationship('MOPReview', backref='mop', cascade='all, delete-orphan')
    executions = db.relationship('ExecutionHistory', backref='mop')

class Command(db.Model):
    __tablename__ = 'commands'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    command = db.Column(db.Text, nullable=False)
    reference_value = db.Column(db.Text, nullable=False)
    
    # Relationships
    results = db.relationship('ServerResult', backref='command')

class MOPFile(db.Model):
    __tablename__ = 'mop_files'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    file_type = db.Column(db.String(10), nullable=False)
    file_path = db.Column(db.Text, nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

class MOPReview(db.Model):
    __tablename__ = 'mop_reviews'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    reject_reason = db.Column(db.Text)
    reviewed_at = db.Column(db.DateTime, default=datetime.utcnow)
