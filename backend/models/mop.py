from datetime import datetime
from . import db
from sqlalchemy.dialects.postgresql import ARRAY
import enum

class MOPStatus(enum.Enum):
    CREATED = 'created'
    EDITED = 'edited'
    PENDING = 'pending'
    APPROVED = 'approved'
    DELETED = 'deleted'

class MOP(db.Model):
    __tablename__ = 'mops'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    type = db.Column(ARRAY(db.String(20)), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='created')
    assessment_type = db.Column(db.String(50), nullable=False, default='handover_assessment')
    category = db.Column(db.String(50), nullable=True)
    priority = db.Column(db.String(20), nullable=True)
    estimated_duration = db.Column(db.Integer, nullable=True)
    risk_level = db.Column(db.String(20), nullable=True)
    prerequisites = db.Column(db.Text, nullable=True)
    rollback_plan = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    approved_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships - loại bỏ assessment_results để tránh xung đột
    commands = db.relationship('Command', backref='mop', cascade='all, delete-orphan')
    files = db.relationship('MOPFile', backref='mop', cascade='all, delete-orphan')
    reviews = db.relationship('MOPReview', backref='mop', cascade='all, delete-orphan')
    executions = db.relationship('ExecutionHistory', backref='mop', cascade='all, delete-orphan')

class Command(db.Model):
    __tablename__ = 'commands'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    command_text = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text, nullable=False)
    order_index = db.Column(db.Integer, nullable=False, default=0)
    is_critical = db.Column(db.Boolean, nullable=False, default=False)
    timeout_seconds = db.Column(db.Integer, nullable=True)
    expected_output = db.Column(db.Text, nullable=True)
    rollback_command = db.Column(db.Text, nullable=True)
    
    # Legacy fields for backward compatibility
    title = db.Column(db.String(200), nullable=True)  # Map to description
    command = db.Column(db.Text, nullable=True)  # Map to command_text
    reference_value = db.Column(db.Text, nullable=True)  # Map to expected_output
    
    # Relationships
    results = db.relationship('ServerResult', backref='command')

class MOPFile(db.Model):
    __tablename__ = 'mop_files'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(10), nullable=False)
    file_path = db.Column(db.Text, nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

class MOPReview(db.Model):
    __tablename__ = 'mop_reviews'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    reject_reason = db.Column(db.Text)
    reviewed_at = db.Column(db.DateTime, default=datetime.utcnow)
