from datetime import datetime
from . import db
from sqlalchemy.dialects.postgresql import JSONB

class AssessmentResult(db.Model):
    __tablename__ = 'assessment_results'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    assessment_type = db.Column(db.String(20), nullable=False)  # 'risk' or 'handover'
    server_info = db.Column(JSONB, nullable=False)  # Server connection details
    test_results = db.Column(JSONB, nullable=True)  # Test results for each server
    status = db.Column(db.String(20), nullable=False)  # 'pending', 'running', 'completed', 'failed'
    executed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    execution_logs = db.Column(db.Text, nullable=True)  # Ansible execution logs
    error_message = db.Column(db.Text, nullable=True)  # Error message if failed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    
    # Relationships
    mop = db.relationship('MOP', backref='assessment_results')
    executor = db.relationship('User', backref='assessment_results')
    
    def to_dict(self):
        return {
            'id': self.id,
            'mop_id': self.mop_id,
            'assessment_type': self.assessment_type,
            'server_info': self.server_info,
            'test_results': self.test_results,
            'status': self.status,
            'executed_by': self.executed_by,
            'execution_logs': self.execution_logs,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'mop_name': self.mop.name if self.mop else None,
            'executor_name': self.executor.username if self.executor else None
        }