from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Float, JSON
from sqlalchemy.sql import func
from models import db
from datetime import datetime, timezone, timedelta
import json

# GMT+7 timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))

class JobTracking(db.Model):
    """Model to track job execution status and progress"""
    __tablename__ = 'job_tracking'
    
    id = Column(Integer, primary_key=True)
    job_id = Column(String(255), unique=True, nullable=False, index=True)
    assessment_id = Column(Integer, nullable=True)  # Link to AssessmentResult if available
    status = Column(String(50), nullable=False, default='running')  # running, completed, failed
    progress = Column(Float, default=0.0)  # Overall progress percentage
    
    # Detailed progress information
    current_command = Column(Integer, default=1)
    total_commands = Column(Integer, default=0)
    current_server = Column(Integer, default=1)
    total_servers = Column(Integer, default=0)
    
    # Job metadata
    job_type = Column(String(50), nullable=True)  # risk_assessment, handover_assessment
    user_id = Column(Integer, nullable=True)  # User who started the job
    mop_id = Column(Integer, nullable=True)  # MOP being executed
    
    # Timing information
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Additional data
    error_message = Column(Text, nullable=True)
    result_summary = Column(JSON, nullable=True)  # Store summary of results
    server_info = Column(JSON, nullable=True)  # Store server information
    
    # Redis fallback (for backward compatibility)
    redis_status_key = Column(String(255), nullable=True)
    redis_progress_key = Column(String(255), nullable=True)
    
    def __repr__(self):
        return f'<JobTracking {self.job_id}: {self.status}>'
    
    def to_dict(self):
        """Convert to dictionary for API response"""
        return {
            'id': self.id,
            'job_id': self.job_id,
            'assessment_id': self.assessment_id,
            'status': self.status,
            'progress': self.progress,
            'detailed_progress': {
                'current_command': self.current_command,
                'total_commands': self.total_commands,
                'current_server': self.current_server,
                'total_servers': self.total_servers,
                'percentage': self.progress
            },
            'job_type': self.job_type,
            'user_id': self.user_id,
            'mop_id': self.mop_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message,
            'result_summary': self.result_summary,
            'server_info': self.server_info
        }
    
    @classmethod
    def create_or_update(cls, job_id: str, **kwargs):
        """Create new job tracking or update existing one"""
        job_tracking = cls.query.filter_by(job_id=job_id).first()
        
        if not job_tracking:
            job_tracking = cls(job_id=job_id)
            db.session.add(job_tracking)
        
        # Update fields
        for key, value in kwargs.items():
            if hasattr(job_tracking, key):
                setattr(job_tracking, key, value)
        
        db.session.commit()
        return job_tracking
    
    @classmethod
    def get_by_job_id(cls, job_id: str):
        """Get job tracking by job_id"""
        return cls.query.filter_by(job_id=job_id).first()
    
    @classmethod
    def get_recent_jobs(cls, limit: int = 50):
        """Get recent job tracking records"""
        return cls.query.order_by(cls.created_at.desc()).limit(limit).all()
