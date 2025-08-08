import smtplib
from email.message import EmailMessage
import logging
from typing import List

logger = logging.getLogger(__name__)

def send_report_email(app, subject: str, body: str, attachments: List[str]):
    """Send email with optional attachments using settings from app.config."""
    if not app.config.get('MAIL_ENABLED', False):
        logger.info("[EMAIL] Mail disabled by config")
        return

    try:
        smtp_server = app.config['MAIL_SERVER']
        smtp_port = app.config.get('MAIL_PORT', 587)
        username = app.config['MAIL_USERNAME']
        password = app.config['MAIL_PASSWORD']
        recipients = app.config.get('MAIL_RECIPIENTS', [])
        if not recipients:
            logger.warning("[EMAIL] No recipients configured, skip sending")
            return

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = username
        msg['To'] = ", ".join(recipients)
        msg.set_content(body)

        for path in attachments:
            try:
                with open(path, 'rb') as f:
                    data = f.read()
                    fname = path.split('/')[-1]
                    msg.add_attachment(data, maintype='application', subtype='octet-stream', filename=fname)
            except Exception as e:
                logger.warning(f"[EMAIL] Failed to attach {path}: {e}")

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(username, password)
            server.send_message(msg)
        logger.info("[EMAIL] Report email sent")
    except Exception as e:
        logger.error(f"[EMAIL] Sending failed: {e}")

