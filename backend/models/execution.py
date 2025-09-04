from datetime import datetime
from . import db

class ExecutionHistory(db.Model):
    __tablename__ = 'execution_history'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    command_id = db.Column(db.Integer, db.ForeignKey('commands.id'), nullable=True)  # For single command execution
    executed_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    server_id = db.Column(db.String(100), nullable=True)  # Target server identifier
    status = db.Column(db.String(20), nullable=False, default='pending')  # pending, running, completed, failed, timeout, error
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    duration = db.Column(db.Float, nullable=True)  # Execution duration in seconds
    dry_run = db.Column(db.Boolean, nullable=False, default=False)
    
    # Command execution results
    exit_code = db.Column(db.Integer, nullable=True)
    output = db.Column(db.Text, nullable=True)
    error_output = db.Column(db.Text, nullable=True)
    
    # MOP execution specific fields
    target_servers = db.Column(db.Text, nullable=True)  # Comma-separated server list
    execution_mode = db.Column(db.String(20), nullable=True)  # sequential, parallel
    total_commands = db.Column(db.Integer, nullable=True)
    completed_commands = db.Column(db.Integer, nullable=False, default=0)
    skipped_commands = db.Column(db.Integer, nullable=False, default=0)
    
    # Legacy fields for backward compatibility
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Map to executed_by
    execution_time = db.Column(db.DateTime, nullable=True)  # Map to started_at
    executed_at = db.Column(db.DateTime, nullable=True)  # Map to started_at
    risk_assessment = db.Column(db.Boolean, nullable=True)
    handover_assessment = db.Column(db.Boolean, nullable=True)
    
    # Relationships
    results = db.relationship('ServerResult', backref='execution', cascade='all, delete-orphan')
    executed_by_user = db.relationship('User', foreign_keys=[executed_by], overlaps="executions,user")

class ServerResult(db.Model):
    __tablename__ = 'server_results'
    
    id = db.Column(db.Integer, primary_key=True)
    execution_id = db.Column(db.Integer, db.ForeignKey('execution_history.id'), nullable=False)
    server_ip = db.Column(db.String(45), nullable=False)
    command_id = db.Column(db.Integer, db.ForeignKey('commands.id'), nullable=False)
    output = db.Column(db.Text)
    stderr = db.Column(db.Text)
    return_code = db.Column(db.Integer)
    is_valid = db.Column(db.Boolean, nullable=False)
    
    # Skip condition fields
    skipped = db.Column(db.Boolean, nullable=False, default=False)
    skip_reason = db.Column(db.Text, nullable=True)
    skip_condition_result = db.Column(db.String(20), nullable=True)  # Kết quả của command điều kiện
