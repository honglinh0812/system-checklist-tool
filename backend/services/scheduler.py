from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging
from datetime import datetime

from models import db
from models.mop import MOP, Command
from models.report import RiskReport
from .ansible_manager import AnsibleRunner
from .excel_exporter import ExcelExporter

logger = logging.getLogger(__name__)

runner = AnsibleRunner()
exporter = ExcelExporter()


def build_default_server_list(app):
    """Return list of servers for risk job.
    Currently reads from app.config['DEFAULT_RISK_SERVERS'] (list of dict)
    or returns empty list. Each item must have keys ip, admin_username, admin_password,
    root_username, root_password.
    """
    return app.config.get("DEFAULT_RISK_SERVERS", [])


def run_periodic_risk_assessment(app):
    """Job executed by APScheduler to run all risk MOPs and save RiskReport."""
    with app.app_context():
        logger.info("[RISK-JOB] Starting periodic risk assessment job ...")
        # Fetch approved risk MOPs
        risk_mops = MOP.query.filter(MOP.status == 'APPROVED', MOP.type.any('risk')).all()
        if not risk_mops:
            logger.warning("[RISK-JOB] No approved risk assessment MOPs found. Job aborted.")
            return

        servers = build_default_server_list(app)
        if not servers:
            logger.warning("[RISK-JOB] No default servers configured. Job aborted.")
            return

        timestamp = datetime.now().strftime("%H%M%S_%d%m%Y")
        job_id = f"riskjob_{timestamp}"

        # Combine commands from all risk MOPs maintaining order
        commands = []
        for mop in risk_mops:
            for cmd in mop.commands:
                commands.append({
                    'title': cmd.title,
                    'command': cmd.command,
                    'reference_value': cmd.reference_value,
                    'validation_type': 'exact_match'
                })

        logger.info(f"[RISK-JOB] Running {len(commands)} commands on {len(servers)} servers")

        # Use AnsibleRunner synchronously
        results = runner.run_playbook_sync(commands, servers, timestamp)
        # The sync helper we'll implement in AnsibleRunner quickly
        if not results:
            logger.error("[RISK-JOB] Runner returned no results")
            return

        # Export Excel
        try:
            excel_path = exporter.export_execution_results(results, filename=f"risk_report_{timestamp}.xlsx")
        except Exception as e:
            logger.error(f"[RISK-JOB] Excel export failed: {e}")
            excel_path = ''

        # Save RiskReport
        report = RiskReport(
            created_at=datetime.utcnow(),
            summary=results.get('summary', {}),
            excel_path=excel_path,
            log_path=results.get('log_file', '')
        )
        db.session.add(report)
        db.session.commit()
        logger.info(f"[RISK-JOB] Risk report #{report.id} saved")
        # Send e-mail if enabled
        from utils.emailer import send_report_email
        send_report_email(app,
                          subject=f"[Risk Report] {timestamp}",
                          body=f"Periodic risk assessment report #{report.id}",
                          attachments=[excel_path, results.get('log_file','')])


def init_scheduler(app):
    """Attach APScheduler to Flask app and schedule job."""
    if not app.config.get('RISK_JOB_ENABLED', True):
        logger.info("[RISK-JOB] Scheduler disabled by config")
        return None

    scheduler = BackgroundScheduler(timezone=app.config.get('TZ', 'UTC'))

    cron_expr = app.config.get('RISK_JOB_CRON', '0 2 * * *')  # default 02:00
    try:
        trigger = CronTrigger.from_crontab(cron_expr)
    except ValueError:
        logger.error(f"Invalid CRON expr {cron_expr}, fallback to 0 2 * * *")
        trigger = CronTrigger(hour=2, minute=0)

    scheduler.add_job(run_periodic_risk_assessment, trigger, args=[app], id='risk_assessment_job', replace_existing=True)
    scheduler.start()
    logger.info(f"[RISK-JOB] Scheduler started with cron '{cron_expr}'")
    return scheduler

