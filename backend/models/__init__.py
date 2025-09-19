from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()

def init_db(app):
    db.init_app(app)
    migrate.init_app(app, db)
    
    # Import models here to ensure they are registered with SQLAlchemy
    from .user import User
    from .mop import MOP, Command, MOPFile, MOPReview
    from .execution import ExecutionHistory, ServerResult
    from .report import RiskReport
    from .assessment import AssessmentResult
    from .periodic_assessment import PeriodicAssessment, PeriodicAssessmentExecution
    from .audit_log import UserActivityLog, ActionType, ResourceType
    from .server import Server
    from .job_tracking import JobTracking
