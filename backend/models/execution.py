from datetime import datetime
from . import db

class ExecutionHistory(db.Model):
    __tablename__ = 'execution_history'
    
    id = db.Column(db.Integer, primary_key=True)
    mop_id = db.Column(db.Integer, db.ForeignKey('mops.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    execution_time = db.Column(db.DateTime, default=datetime.utcnow)
    risk_assessment = db.Column(db.Boolean)
    handover_assessment = db.Column(db.Boolean)
    
    # Relationships
    results = db.relationship('ServerResult', backref='execution', cascade='all, delete-orphan')

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
