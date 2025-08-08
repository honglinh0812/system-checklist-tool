from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from . import db

class RiskReport(db.Model):
    """Store periodic risk-assessment reports.
    Each report is created automatically by scheduler after running all approved
    risk-assessment MOPs on a predefined server list.
    """

    __tablename__ = 'risk_reports'

    id = db.Column(db.Integer, primary_key=True)

    # Link to execution history record that produced this report (optional)
    execution_id = db.Column(db.Integer, db.ForeignKey('execution_history.id'))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Summary (success rate, server stats, etc.) as JSON
    summary = db.Column(JSONB, nullable=False)

    # Paths to artefacts stored on disk
    excel_path = db.Column(db.Text, nullable=False)
    log_path = db.Column(db.Text, nullable=False)

    def __repr__(self):
        return f"<RiskReport {self.id} {self.created_at:%Y-%m-%d %H:%M}>"
