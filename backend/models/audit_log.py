from datetime import datetime
from . import db
from sqlalchemy.dialects.postgresql import JSON
import enum

class ActionType(enum.Enum):
    CREATE = 'create'
    UPDATE = 'update'
    DELETE = 'delete'
    APPROVE = 'approve'
    REJECT = 'reject'
    SUBMIT = 'submit'
    LOGIN = 'login'
    LOGOUT = 'logout'
    EXECUTE = 'execute'
    UPLOAD = 'upload'
    DOWNLOAD = 'download'

class ResourceType(enum.Enum):
    MOP = 'mop'
    COMMAND = 'command'
    USER = 'user'
    EXECUTION = 'execution'
    FILE = 'file'
    SYSTEM = 'system'

class UserActivityLog(db.Model):
    __tablename__ = 'user_activity_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    username = db.Column(db.String(50), nullable=False)  # Denormalized for easier querying
    action = db.Column(db.Enum(ActionType), nullable=False)
    resource_type = db.Column(db.Enum(ResourceType), nullable=False)
    resource_id = db.Column(db.Integer, nullable=True)  # ID of the affected resource
    resource_name = db.Column(db.String(255), nullable=True)  # Name of the affected resource
    details = db.Column(JSON, nullable=True)  # Additional details in JSON format
    ip_address = db.Column(db.String(45), nullable=True)  # IPv4/IPv6 address
    user_agent = db.Column(db.Text, nullable=True)  # Browser/client info
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = db.relationship('User', backref='activity_logs')
    
    def __repr__(self):
        return f'<UserActivityLog {self.username} {self.action.value} {self.resource_type.value} at {self.created_at}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.username,
            'action': self.action.value,
            'resource_type': self.resource_type.value,
            'resource_id': self.resource_id,
            'resource_name': self.resource_name,
            'details': self.details,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    @classmethod
    def log_action(cls, user_id, username, action, resource_type, 
                   resource_id=None, resource_name=None, details=None, 
                   ip_address=None, user_agent=None):
        """Helper method to create activity log entry"""
        log_entry = cls(
            user_id=user_id,
            username=username,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_name=resource_name,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.session.add(log_entry)
        return log_entry
    
    @classmethod
    def cleanup_old_logs(cls, days_to_keep=365):
        """Clean up logs older than specified days (default 1 year)"""
        cutoff_date = datetime.utcnow() - timedelta(days=days_to_keep)
        old_logs = cls.query.filter(cls.created_at < cutoff_date)
        count = old_logs.count()
        old_logs.delete()
        db.session.commit()
        return count