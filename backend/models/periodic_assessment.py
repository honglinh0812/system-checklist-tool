from datetime import datetime
from . import db
from sqlalchemy.dialects.postgresql import JSONB
import enum

class PeriodicFrequency(enum.Enum):
    DAILY = 'daily'
    WEEKLY = 'weekly'
    MONTHLY = 'monthly'
    QUARTERLY = 'quarterly'

class PeriodicStatus(enum.Enum):
    ACTIVE = 'active'
    PAUSED = 'paused'
    INACTIVE = 'inactive'
    COMPLETED = 'completed'

class PeriodicAssessment(db.Model):
    __tablename__ = 'periodic_assessments'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    assessment_type = db.Column(db.String(20), nullable=False)  # 'risk' or 'handover'
    frequency = db.Column(db.Enum(PeriodicFrequency), nullable=False)
    execution_time = db.Column(db.String(5), nullable=False)  # Format: "HH:MM"
    server_info = db.Column(JSONB, nullable=False)  # Server connection details
    status = db.Column(db.Enum(PeriodicStatus), nullable=False, default=PeriodicStatus.ACTIVE)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_execution = db.Column(db.DateTime, nullable=True)
    next_execution = db.Column(db.DateTime, nullable=True)
    
    # Relationships
    mop = db.relationship('MOP', backref=db.backref('periodic_assessments', cascade='all, delete-orphan'))
    creator = db.relationship('User', backref='periodic_assessments')
    executions = db.relationship('PeriodicAssessmentExecution', backref='periodic_assessment', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'mop_id': self.mop_id,
            'mop_name': self.mop.name if self.mop else None,
            'assessment_type': self.assessment_type,
            'frequency': self.frequency.value,
            'execution_time': self.execution_time,
            'server_info': self.server_info,
            'status': self.status.value,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'last_execution': self.last_execution.isoformat() if self.last_execution else None,
            'next_execution': self.next_execution.isoformat() if self.next_execution else None,
            'execution_count': len(self.executions) if self.executions else 0
        }

class PeriodicAssessmentExecution(db.Model):
    __tablename__ = 'periodic_assessment_executions'
    
    id = db.Column(db.Integer, primary_key=True)
    periodic_assessment_id = db.Column(db.Integer, db.ForeignKey('periodic_assessments.id'), nullable=False)
    assessment_result_id = db.Column(db.Integer, db.ForeignKey('assessment_results.id'), nullable=True)
    status = db.Column(db.String(20), nullable=False, default='pending')  # 'pending', 'running', 'success', 'fail'
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    execution_logs = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    assessment_result = db.relationship('AssessmentResult', backref='periodic_executions')
    
    def to_dict(self):
        return {
            'id': self.id,
            'periodic_assessment_id': self.periodic_assessment_id,
            'assessment_result_id': self.assessment_result_id,
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message,
            'execution_logs': self.execution_logs,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'duration': (self.completed_at - self.started_at).total_seconds() if self.started_at and self.completed_at else None,
            'assessment_result': self.assessment_result.to_dict() if self.assessment_result else None
        }