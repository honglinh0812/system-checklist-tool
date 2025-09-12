from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from models.periodic_assessment import PeriodicAssessment, PeriodicAssessmentExecution, PeriodicFrequency, PeriodicStatus
from models.assessment import AssessmentResult
from models.audit_log import ActionType, ResourceType
from models import db
from utils.audit_helpers import log_user_activity
from services.ansible_manager import AnsibleRunner
import logging

# GMT+7 timezone
from datetime import timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))

logger = logging.getLogger(__name__)

def execute_periodic_assessment(app, periodic_assessment_id):
    """Execute a single periodic assessment and log to audit"""
    with app.app_context():
        try:
            # Get periodic assessment
            periodic_assessment = PeriodicAssessment.query.get(periodic_assessment_id)
            if not periodic_assessment or periodic_assessment.status != PeriodicStatus.ACTIVE:
                logger.warning(f"Periodic assessment {periodic_assessment_id} not found or not active")
                return
            
            # Create execution record
            execution = PeriodicAssessmentExecution(
                periodic_assessment_id=periodic_assessment_id,
                status='running',
                started_at=datetime.now(GMT_PLUS_7)
            )
            db.session.add(execution)
            db.session.commit()
            
            logger.info(f"Starting periodic assessment execution {execution.id} for assessment {periodic_assessment_id}")
            
            # Prepare commands from MOP
            commands = []
            if periodic_assessment.mop and periodic_assessment.mop.commands:
                for cmd in periodic_assessment.mop.commands:
                    commands.append({
                        'title': cmd.title,
                        'command': cmd.command,
                        'reference_value': cmd.reference_value,
                        'validation_type': 'exact_match'
                    })
            
            if not commands:
                execution.status = 'fail'
                execution.error_message = 'No commands found in MOP'
                execution.completed_at = datetime.now(GMT_PLUS_7)
                db.session.commit()
                return
            
            # Prepare servers - only use selected servers
            all_servers = periodic_assessment.server_info or []
            servers = [server for server in all_servers if server.get('selected', True)]
            if not servers:
                execution.status = 'fail'
                execution.error_message = 'No servers selected for assessment'
                execution.completed_at = datetime.now(GMT_PLUS_7)
                db.session.commit()
                return
            
            # Create assessment result record
            assessment_result = AssessmentResult(
                mop_id=periodic_assessment.mop_id,
                assessment_type=periodic_assessment.assessment_type,
                server_info=servers,
                status='pending',
                executed_by=periodic_assessment.created_by,
                started_at=datetime.now(GMT_PLUS_7)
            )
            db.session.add(assessment_result)
            db.session.commit()
            
            # Link execution to assessment result
            execution.assessment_result_id = assessment_result.id
            db.session.commit()
            
            # Execute using AnsibleRunner
            timestamp = datetime.now(GMT_PLUS_7).strftime("%H%M%S_%d%m%Y")
            runner = AnsibleRunner()
            
            # Run assessment
            results = runner.run_playbook_sync(
                commands, 
                servers, 
                timestamp, 
                assessment_type=periodic_assessment.assessment_type.title()
            )
            
            # Update execution and assessment result based on results
            if results:
                execution.status = 'success'
                execution.execution_logs = str(results)
                assessment_result.status = 'success'
                assessment_result.test_results = results
            else:
                execution.status = 'fail'
                execution.error_message = 'Assessment execution failed'
                assessment_result.status = 'fail'
                assessment_result.error_message = 'Assessment execution failed'
            
            # Update timestamps
            execution.completed_at = datetime.now(GMT_PLUS_7)
            assessment_result.completed_at = datetime.now(GMT_PLUS_7)
            
            # Update periodic assessment last execution
            periodic_assessment.last_execution = datetime.now(GMT_PLUS_7)
            periodic_assessment.next_execution = calculate_next_execution(
                periodic_assessment.frequency, 
                periodic_assessment.execution_time
            )
            
            db.session.commit()
            
            # Log to audit
            log_user_activity(
                user_id=periodic_assessment.created_by,
                action=ActionType.EXECUTE,
                resource_type=ResourceType.ASSESSMENT,
                resource_id=execution.id,
                resource_name=f"Periodic {periodic_assessment.assessment_type} assessment for MOP {periodic_assessment.mop.name if periodic_assessment.mop else 'Unknown'}",
                details={
                    'periodic_assessment_id': periodic_assessment_id,
                    'execution_id': execution.id,
                    'assessment_result_id': assessment_result.id,
                    'assessment_type': periodic_assessment.assessment_type,
                    'frequency': periodic_assessment.frequency.value,
                    'server_count': len(servers),
                    'status': execution.status,
                    'duration': (execution.completed_at - execution.started_at).total_seconds() if execution.completed_at and execution.started_at else None
                }
            )
            
            logger.info(f"Completed periodic assessment execution {execution.id} with status {execution.status}")
            
        except Exception as e:
            logger.error(f"Error executing periodic assessment {periodic_assessment_id}: {str(e)}")
            # Update execution status to failed
            try:
                execution.status = 'fail'
                execution.error_message = str(e)
                execution.completed_at = datetime.now(GMT_PLUS_7)
                db.session.commit()
            except:
                pass

def calculate_next_execution(frequency: PeriodicFrequency, execution_time: str) -> datetime:
    """Calculate next execution time based on frequency and time"""
    now = datetime.now(GMT_PLUS_7)
    hour, minute = map(int, execution_time.split(':'))
    
    if frequency == PeriodicFrequency.DAILY:
        next_exec = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_exec <= now:
            next_exec += timedelta(days=1)
    elif frequency == PeriodicFrequency.WEEKLY:
        next_exec = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        days_ahead = 7 - now.weekday()  # Next Monday
        if days_ahead <= 0 or (days_ahead == 7 and next_exec <= now):
            days_ahead += 7
        next_exec += timedelta(days=days_ahead)
    elif frequency == PeriodicFrequency.MONTHLY:
        next_exec = now.replace(day=1, hour=hour, minute=minute, second=0, microsecond=0)
        if next_exec <= now:
            if next_exec.month == 12:
                next_exec = next_exec.replace(year=next_exec.year + 1, month=1)
            else:
                next_exec = next_exec.replace(month=next_exec.month + 1)
    elif frequency == PeriodicFrequency.QUARTERLY:
        next_exec = now.replace(day=1, hour=hour, minute=minute, second=0, microsecond=0)
        current_quarter = (now.month - 1) // 3 + 1
        next_quarter_month = current_quarter * 3 + 1
        if next_quarter_month > 12:
            next_exec = next_exec.replace(year=next_exec.year + 1, month=1)
        else:
            next_exec = next_exec.replace(month=next_quarter_month)
    
    return next_exec

def check_and_execute_periodic_assessments(app):
    """Check for periodic assessments that need to be executed"""
    with app.app_context():
        try:
            now = datetime.now(GMT_PLUS_7)
            
            # Find active periodic assessments that are due for execution
            due_assessments = PeriodicAssessment.query.filter(
                PeriodicAssessment.status == PeriodicStatus.ACTIVE,
                db.or_(
                    PeriodicAssessment.next_execution.is_(None),
                    PeriodicAssessment.next_execution <= now
                )
            ).all()
            
            logger.info(f"Found {len(due_assessments)} periodic assessments due for execution")
            
            for assessment in due_assessments:
                # Execute in background
                execute_periodic_assessment(app, assessment.id)
                
        except Exception as e:
            logger.error(f"Error checking periodic assessments: {str(e)}")

def init_periodic_scheduler(app):
    """Initialize periodic assessment scheduler"""
    if not app.config.get('PERIODIC_ASSESSMENT_ENABLED', True):
        logger.info("Periodic assessment scheduler disabled by config")
        return None
    
    scheduler = BackgroundScheduler(timezone=app.config.get('TZ', 'UTC'))
    
    # Check every 5 minutes for due assessments (fixed from 5000 minutes)
    scheduler.add_job(
        check_and_execute_periodic_assessments,
        'interval',
        minutes=5,
        args=[app],
        id='periodic_assessment_checker',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Periodic assessment scheduler started")
    return scheduler