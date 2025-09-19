from flask import Blueprint, request, send_file, current_app, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import desc, func
from datetime import datetime, timedelta, timezone

# GMT+7 timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))
from models.mop import MOP
from models.execution import ExecutionHistory
from models.report import RiskReport
from models.user import User
from models.assessment import AssessmentResult
from models.periodic_assessment import PeriodicAssessment, PeriodicAssessmentExecution, PeriodicFrequency, PeriodicStatus
from models import db
from .api_utils import (
    api_response, api_error, paginate_query, validate_json,
    get_request_filters, apply_filters, require_role
)
from core.auth import get_current_user
from services.ansible_manager import AnsibleRunner
from utils.audit_helpers import log_user_management_action, log_mop_action, log_user_activity
from services.realtime import sse_job_stream
from models.audit_log import ActionType, ResourceType
import logging
import os
import tempfile
import threading
import time
import paramiko
import socket

def get_job_status_from_database(job_id: str, resolved_id: str):
    """Get job status from database with detailed progress"""
    try:
        from models.job_tracking import JobTracking
        
        # Try to get from database first
        job_tracking = JobTracking.get_by_job_id(resolved_id)
        if job_tracking:
            return {
                'job_id': job_id,
                'status': job_tracking.status,
                'progress': job_tracking.progress,
                'logs': [],
                'detailed_progress': {
                    'current_command': max(1, job_tracking.current_command),
                    'total_commands': job_tracking.total_commands,
                    'current_server': max(1, job_tracking.current_server),
                    'total_servers': job_tracking.total_servers,
                    'percentage': max(5, job_tracking.progress) if job_tracking.status == 'running' else job_tracking.progress
                }
            }
        
        # Fallback to Redis if not found in database
        return get_job_status_from_redis(job_id, resolved_id)
        
    except Exception as e:
        logger.warning(f"Failed to get job status from database for {job_id}: {e}")
        # Fallback to Redis
        return get_job_status_from_redis(job_id, resolved_id)

def get_job_status_from_redis(job_id: str, resolved_id: str):
    """Get job status from Redis with detailed progress"""
    try:
        from services.jobs.job_map import get_redis_connection
        import json
        
        conn = get_redis_connection()
        status_key = f"job_status:{resolved_id}"
        progress_key = f"job_progress:{resolved_id}"
        
        status_data = conn.get(status_key)
        progress_data = conn.get(progress_key)
        
        if status_data:
            try:
                status = json.loads(status_data.decode('utf-8') if isinstance(status_data, bytes) else status_data)
                
                # Add detailed progress information
                if progress_data:
                    try:
                        progress_info = json.loads(progress_data.decode('utf-8') if isinstance(progress_data, bytes) else progress_data)
                        
                        # Ensure progress values are never 0 during execution
                        current_command = max(1, progress_info.get('current_command', 1))
                        current_server = max(1, progress_info.get('current_server', 1))
                        total_commands = progress_info.get('total_commands', 0)
                        total_servers = progress_info.get('total_servers', 0)
                        percentage = max(5, progress_info.get('percentage', 5))  # Minimum 5%
                        
                        # Ensure we don't exceed totals
                        if total_commands > 0:
                            current_command = min(current_command, total_commands)
                        if total_servers > 0:
                            current_server = min(current_server, total_servers)
                        
                        return {
                            'job_id': job_id,
                            'status': status.get('status', 'running'),
                            'progress': status.get('progress', percentage),
                            'logs': [],
                            'detailed_progress': {
                                'current_command': current_command,
                                'total_commands': total_commands,
                                'current_server': current_server,
                                'total_servers': total_servers,
                                'percentage': percentage
                            }
                        }
                    except (json.JSONDecodeError, TypeError):
                        pass
            except (json.JSONDecodeError, TypeError):
                pass
    except Exception as e:
        logger.warning(f"Failed to get job status from Redis for {job_id}: {e}")
    
    return None

logger = logging.getLogger(__name__)

assessments_bp = Blueprint('assessments', __name__, url_prefix='/api/assessments')
ansible_runner = AnsibleRunner()

@assessments_bp.route('/risk', methods=['GET'])
@jwt_required()
def get_risk_assessments():
    """Get risk assessment data"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get filter parameters
        filters = get_request_filters()
        
        # Build base query for MOPs
        query = MOP.query
        
        # Apply role-based filtering
        if current_user.role == 'user':
            query = query.filter(MOP.created_by == current_user.id)
        
        # Apply risk level filter
        risk_level = request.args.get('risk_level')
        if risk_level:
            query = query.filter(MOP.risk_level == risk_level)
        
        # Apply status filter
        if filters.get('status'):
            query = query.filter(MOP.status == filters['status'])
        
        # Apply date range filter
        if filters.get('date_from'):
            query = query.filter(MOP.created_at >= filters['date_from'])
        if filters.get('date_to'):
            query = query.filter(MOP.created_at <= filters['date_to'])
        
        # Get risk statistics
        risk_stats = db.session.query(
            MOP.risk_level,
            func.count(MOP.id).label('count')
        ).group_by(MOP.risk_level).all()
        
        # Get high-risk MOPs
        high_risk_mops = query.filter(MOP.risk_level.in_(['high', 'critical'])).order_by(desc(MOP.created_at)).limit(10).all()
        
        # Get recent risk reports
        recent_reports = RiskReport.query.order_by(desc(RiskReport.created_at)).limit(5).all()
        
        # Serialize data
        risk_data = {
            'statistics': {
                'total_mops': query.count(),
                'risk_distribution': [{'risk_level': stat.risk_level, 'count': stat.count} for stat in risk_stats]
            },
            'high_risk_mops': [
                {
                    'id': mop.id,
                    'name': mop.name,
                    'risk_level': mop.risk_level,
                    'status': mop.status,
                    'created_at': mop.created_at.isoformat(),
                    'category': mop.category
                } for mop in high_risk_mops
            ],
            'recent_reports': [
                {
                    'id': report.id,
                    'report_type': report.report_type,
                    'created_at': report.created_at.isoformat(),
                    'status': getattr(report, 'status', 'completed')
                } for report in recent_reports
            ]
        }
        
        return api_response(risk_data)
        
    except Exception as e:
        logger.error(f"Error fetching risk assessments: {str(e)}")
        return api_error('Failed to fetch risk assessments', 500)

@assessments_bp.route('/handover', methods=['GET'])
@jwt_required()
def get_handover_assessments():
    """Get handover assessment data"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get filter parameters
        filters = get_request_filters()
        
        # Build base query for executions
        query = ExecutionHistory.query.join(MOP)
        
        # Apply role-based filtering
        if current_user.role == 'user':
            query = query.filter(ExecutionHistory.executed_by == current_user.id)
        
        # Apply status filter
        if filters.get('status'):
            query = query.filter(ExecutionHistory.status == filters['status'])
        
        # Apply date range filter
        if filters.get('date_from'):
            query = query.filter(ExecutionHistory.started_at >= filters['date_from'])
        if filters.get('date_to'):
            query = query.filter(ExecutionHistory.started_at <= filters['date_to'])
        
        # Get execution statistics
        execution_stats = db.session.query(
            ExecutionHistory.status,
            func.count(ExecutionHistory.id).label('count')
        ).group_by(ExecutionHistory.status).all()
        
        # Get recent executions
        recent_executions = query.order_by(desc(ExecutionHistory.started_at)).limit(10).all()
        
        # Get pending handovers (completed executions without handover)
        pending_handovers = query.filter(
            ExecutionHistory.status == 'completed',
            ExecutionHistory.handover_assessment.is_(None)
        ).order_by(desc(ExecutionHistory.completed_at)).limit(10).all()
        
        # Serialize data
        handover_data = {
            'statistics': {
                'total_executions': query.count(),
                'status_distribution': [{'status': stat.status, 'count': stat.count} for stat in execution_stats],
                'pending_handovers': len(pending_handovers)
            },
            'recent_executions': [
                {
                    'id': execution.id,
                    'mop_name': execution.mop.name if execution.mop else 'Unknown MOP',
                    'status': execution.status,
                    'started_at': execution.started_at.isoformat() if execution.started_at else None,
                    'completed_at': execution.completed_at.isoformat() if execution.completed_at else None,
                    'duration': execution.duration,
                    'executed_by': execution.executed_by,
                    'handover_completed': execution.handover_assessment is not None,
                    'dry_run': execution.dry_run
                } for execution in recent_executions
            ],
            'pending_handovers': [
                {
                    'id': execution.id,
                    'mop_name': execution.mop.name if execution.mop else 'Unknown MOP',
                    'completed_at': execution.completed_at.isoformat() if execution.completed_at else None,
                    'executed_by': execution.executed_by,
                    'duration': execution.duration
                } for execution in pending_handovers
            ]
        }
        
        return api_response(handover_data)
        
    except Exception as e:
        logger.error(f"Error fetching handover assessments: {str(e)}")
        return api_error('Failed to fetch handover assessments', 500)

@assessments_bp.route('/risk/generate', methods=['POST'])
@require_role('admin')
def generate_risk_report():
    """Generate a new risk assessment report"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json() or {}
        report_type = data.get('report_type', 'comprehensive')
        date_from = data.get('date_from')
        date_to = data.get('date_to')
        
        # Create risk report record
        risk_report = RiskReport(
            report_type=report_type,
            generated_by=current_user.id,
            created_at=datetime.now(GMT_PLUS_7),
            parameters={
                'date_from': date_from,
                'date_to': date_to,
                'report_type': report_type
            }
        )
        
        db.session.add(risk_report)
        db.session.commit()
        
        # TODO: Implement actual report generation logic
        # This would involve analyzing MOPs, executions, and generating PDF/Excel reports
        
        logger.info(f"Risk report {risk_report.id} generated by user {current_user.id}")
        
        return api_response({
            'message': 'Risk report generation started',
            'report_id': risk_report.id,
            'report_type': report_type,
            'status': 'generating'
        })
        
    except Exception as e:
        logger.error(f"Error generating risk report: {str(e)}")
        db.session.rollback()
        return api_error('Failed to generate risk report', 500)

@assessments_bp.route('/reports', methods=['GET'])
@jwt_required()
def get_assessment_reports():
    """Get list of assessment reports"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Build query
        query = RiskReport.query
        
        # Apply role-based filtering
        if current_user.role == 'user':
            query = query.filter(RiskReport.generated_by == current_user.id)
        
        # Apply filters
        report_type = request.args.get('report_type')
        if report_type:
            query = query.filter(RiskReport.report_type == report_type)
        
        # Paginate
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        
        result = paginate_query(query.order_by(desc(RiskReport.created_at)), page, per_page)
        
        # Serialize reports
        reports_data = []
        for report in result['items']:
            generator = db.session.get(User, report.generated_by)
            reports_data.append({
                'id': report.id,
                'report_type': report.report_type,
                'created_at': report.created_at.isoformat(),
                'generated_by': {
                    'id': generator.id,
                    'username': generator.username,
                    'full_name': generator.full_name
                } if generator else None,
                'parameters': report.parameters,
                'status': getattr(report, 'status', 'completed')
            })
        
        return api_response({
            'reports': reports_data,
            'pagination': result['pagination']
        })
        
    except Exception as e:
        logger.error(f"Error fetching assessment reports: {str(e)}")
        return api_error('Failed to fetch reports', 500)

@assessments_bp.route('/reports/<int:report_id>/download', methods=['GET'])
@jwt_required()
def download_assessment_report(report_id):
    """Download an assessment report"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        report = RiskReport.query.get_or_404(report_id)
        
        # Check permissions
        if current_user.role == 'user' and report.generated_by != current_user.id:
            return api_error('Access denied', 403)
        
        # TODO: Implement actual file download logic
        # For now, create a temporary file with report data
        
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
        temp_file.write(f"Risk Assessment Report\n")
        temp_file.write(f"Report ID: {report.id}\n")
        temp_file.write(f"Type: {report.report_type}\n")
        temp_file.write(f"Generated: {report.created_at}\n")
        temp_file.write(f"Parameters: {report.parameters}\n")
        temp_file.close()
        
        return send_file(
            temp_file.name,
            as_attachment=True,
            download_name=f'risk_report_{report_id}.txt'
        )
        
    except Exception as e:
        logger.error(f"Error downloading report {report_id}: {str(e)}")
        return api_error('Failed to download report', 500)

# =========================
# Saved Servers Endpoints
# =========================

@assessments_bp.route('/risk/recent-servers', methods=['GET'])
@jwt_required()
def get_risk_recent_servers():
    """Return recent server entries from risk assessments.

    Query params:
      - limit: number of entries (default 20, max 100)
      - include: 'detail' to include full servers array
    """
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)

        limit = min(request.args.get('limit', 20, type=int), 100)
        include_detail = request.args.get('include') == 'detail'

        q = AssessmentResult.query.filter_by(assessment_type='risk').order_by(AssessmentResult.created_at.desc())
        # Users only see their own entries
        if current_user.role == 'user':
            q = q.filter(AssessmentResult.executed_by == current_user.id)

        results = []
        for ar in q.limit(limit).all():
            servers = ar.server_info or []
            results.append({
                'id': ar.id,
                'source_type': 'assessment',
                'created_at': ar.created_at.isoformat() if getattr(ar, 'created_at', None) else None,
                'total_servers': len(servers),
                'description': f"Risk assessment #{ar.id}",
                'servers': servers if include_detail else None
            })

        return api_response({'entries': results, 'total': len(results)})
    except Exception as e:
        logger.error(f"Error fetching risk recent servers: {str(e)}")
        return api_error('Failed to fetch recent servers', 500)


@assessments_bp.route('/handover/recent-servers', methods=['GET'])
@jwt_required()
def get_handover_recent_servers():
    """Return recent server entries from handover assessments.

    Query params:
      - limit: number of entries (default 20, max 100)
      - include: 'detail' to include full servers array
    """
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)

        limit = min(request.args.get('limit', 20, type=int), 100)
        include_detail = request.args.get('include') == 'detail'

        q = AssessmentResult.query.filter_by(assessment_type='handover').order_by(AssessmentResult.created_at.desc())
        if current_user.role == 'user':
            q = q.filter(AssessmentResult.executed_by == current_user.id)

        results = []
        for ar in q.limit(limit).all():
            servers = ar.server_info or []
            results.append({
                'id': ar.id,
                'source_type': 'assessment',
                'created_at': ar.created_at.isoformat() if getattr(ar, 'created_at', None) else None,
                'total_servers': len(servers),
                'description': f"Handover assessment #{ar.id}",
                'servers': servers if include_detail else None
            })

        return api_response({'entries': results, 'total': len(results)})
    except Exception as e:
        logger.error(f"Error fetching handover recent servers: {str(e)}")
        return api_error('Failed to fetch recent servers', 500)


@assessments_bp.route('/servers/uploads', methods=['GET'])
@jwt_required()
def get_uploaded_server_lists():
    """List uploaded server files and basic metadata.

    Assumes server lists are kept under uploads/servers/*.csv|*.xlsx|*.xls
    Return: id (path hash), file_name, created_at (mtime), size, total_lines (if applicable)
    """
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)

        base_dir = os.path.join('uploads', 'servers')
        if not os.path.isdir(base_dir):
            return api_response({'entries': [], 'total': 0})

        allowed_exts = {'.csv', '.xlsx', '.xls'}
        entries = []
        for fname in os.listdir(base_dir):
            fpath = os.path.join(base_dir, fname)
            if not os.path.isfile(fpath):
                continue
            _, ext = os.path.splitext(fname)
            if ext.lower() not in allowed_exts:
                continue
            stat = os.stat(fpath)
            total_lines = None
            if ext.lower() in {'.csv'}:
                try:
                    with open(fpath, 'r', encoding='utf-8', errors='ignore') as fh:
                        total_lines = sum(1 for _ in fh)
                except Exception:
                    total_lines = None
            entries.append({
                'id': fpath,
                'source_type': 'upload',
                'file_name': fname,
                'created_at': datetime.fromtimestamp(stat.st_mtime, tz=GMT_PLUS_7).isoformat(),
                'size': stat.st_size,
                'total_lines': total_lines
            })

        # Sort by mtime desc
        entries.sort(key=lambda e: e['created_at'], reverse=True)
        return api_response({'entries': entries, 'total': len(entries)})
    except Exception as e:
        logger.error(f"Error listing uploaded server files: {str(e)}")
        return api_error('Failed to list uploaded server files', 500)

# New Assessment Endpoints

def test_ssh_connection(server_ip, username, password, port=22, timeout=10):
    """Simple SSH connection test"""
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        # Test connection
        ssh.connect(
            hostname=server_ip,
            username=username,
            password=password,
            port=port,
            timeout=timeout,
            allow_agent=False,
            look_for_keys=False
        )
        
        # Execute simple test command
        stdin, stdout, stderr = ssh.exec_command('echo "SSH test successful"')
        output = stdout.read().decode().strip()
        
        ssh.close()
        
        if 'SSH test successful' in output:
            return True, 'SSH connection successful'
        else:
            return False, 'SSH command execution failed'
            
    except paramiko.AuthenticationException:
        return False, 'Authentication failed - invalid credentials'
    except paramiko.SSHException as e:
        return False, f'SSH connection error: {str(e)}'
    except socket.timeout:
        return False, 'Connection timeout - server unreachable'
    except socket.error as e:
        return False, f'Network error: {str(e)}'
    except Exception as e:
        return False, f'Connection failed: {str(e)}'

@assessments_bp.route('/risk/test-connection', methods=['POST'])
@jwt_required()
def test_risk_connection():
    """Test SSH connection to servers for risk assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json()
        if not data or 'servers' not in data:
            return api_error('Server information required', 400)
        
        servers = data['servers']
        connection_results = []
        
        for index, server in enumerate(servers):
            server_ip = server.get('ip') or server.get('serverIP')
            
            # Skip test for localhost/127.0.0.1
            if server_ip in ['localhost', '127.0.0.1']:
                result = {
                    'ip': server_ip,
                    'success': True,
                    'message': 'Local connection (no SSH required)',
                    'serverIndex': index
                }
                connection_results.append(result)
                continue
            
            # Get credentials
            admin_username = server.get('admin_username')
            admin_password = server.get('admin_password')
            ssh_port = server.get('sshPort', 22)
            
            if not admin_username or not admin_password:
                result = {
                    'ip': server_ip,
                    'success': False,
                    'message': 'Missing SSH credentials (admin_username/admin_password)',
                    'serverIndex': index
                }
                connection_results.append(result)
                continue
            
            # Test SSH connection
            success, message = test_ssh_connection(server_ip, admin_username, admin_password, ssh_port)
            
            result = {
                'ip': server_ip,
                'success': success,
                'message': message,
                'serverIndex': index
            }
            connection_results.append(result)
        
        return api_response({
            'results': connection_results
        })
        
    except Exception as e:
        logger.error(f"Error testing connections: {str(e)}")
        return api_error('Failed to test connections', 500)

@assessments_bp.route('/risk/start', methods=['POST'])
@jwt_required()
def start_risk_assessment():
    """Start risk assessment (uses JobManager with Redis fallback)"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json()
        logger.info(f"Starting risk assessment - Request data: {data}")
        
        if not data or 'mop_id' not in data or 'servers' not in data:
            logger.error(f"Missing required data - Data: {data}")
            return api_error('MOP ID and server information required', 400)
        
        mop_id = data['mop_id']
        servers = data['servers']
        
        # Validate MOP exists and has risk_assessment type
        mop = MOP.query.get_or_404(mop_id)
        if mop.assessment_type != 'risk_assessment':
            return api_error('MOP is not configured for risk assessment', 400)
        
        # Create assessment record
        logger.info(f"Creating assessment record for MOP {mop_id} by user {current_user.id}")
        assessment = AssessmentResult(
            mop_id=mop_id,
            assessment_type='risk',
            server_info=servers,
            status='pending',
            executed_by=current_user.id
        )
        db.session.add(assessment)
        db.session.commit()
        logger.info(f"Assessment record created with ID: {assessment.id}")
        
        # Use JobManager for automatic fallback between Redis and sync execution
        from services.jobs.job_manager import job_manager
        job_result = job_manager.enqueue_assessment(
            assessment_id=assessment.id,
            mop_id=mop_id,
            servers=servers,
            assessment_label='Risk'
        )
        job_id = job_result['job_id']
        mode = job_result['mode']
        status = job_result['status']
        logger.info(f"Risk assessment started with job ID: {job_id}, mode: {mode}, status: {status}")

        # Update assessment status if completed synchronously
        if mode == 'sync' and status in ['completed', 'failed']:
            assessment.status = 'completed' if status == 'completed' else 'failed'
            db.session.commit()
        
        # Log assessment creation
        log_user_activity(
            user_id=current_user.id,
            username=current_user.username,
            action=ActionType.CREATE,
            resource_type=ResourceType.ASSESSMENT,
            resource_id=assessment.id,
            resource_name=f"Risk Assessment for MOP {mop.name}",
            details={
                'assessment_type': 'risk',
                'mop_id': mop.id,
                'mop_name': mop.name,
                'server_count': len(data.get('servers', []))
            }
        )
        
        return api_response({
            'assessment_id': assessment.id,
            'job_id': job_id,
            'mode': mode,
            'status': status,
            'message': f'Risk assessment started in {mode} mode'
        })
        
    except Exception as e:
        logger.error(f"Error starting risk assessment: {str(e)}")
        return api_error('Failed to start risk assessment', 500)

@assessments_bp.route('/risk/results/<int:assessment_id>', methods=['GET'])
@jwt_required()
def get_risk_assessment_results(assessment_id):
    """Get risk assessment results"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        assessment = AssessmentResult.query.get_or_404(assessment_id)
        
        # Check permissions
        if current_user.role == 'user' and assessment.executed_by != current_user.id:
            return api_error('Access denied', 403)
        
        # Get real-time logs if assessment is still pending
        result_data = assessment.to_dict()
        if assessment.status == 'pending':
            # Try to get real-time logs from ansible runner
            job_id = f'risk_assessment_{assessment.id}_*'
            # Find the actual job_id by checking running jobs
            for running_job_id in ansible_runner.running_jobs.keys():
                if f'risk_assessment_{assessment.id}_' in running_job_id:
                    job_status = ansible_runner.get_job_status(running_job_id)
                    job_logs = ansible_runner.get_job_logs(running_job_id)
                    
                    if job_logs and job_logs.get('log_content'):
                        result_data['execution_logs'] = job_logs['log_content']
                    
                    if job_status:
                        result_data['job_status'] = job_status
                    break
        
        return api_response(result_data)
        
    except Exception as e:
        logger.error(f"Error fetching assessment results: {str(e)}")
        return api_error('Failed to fetch assessment results', 500)

@assessments_bp.route('/handover/test-connection', methods=['POST'])
@jwt_required()
def test_handover_connection():
    """Test SSH connection to servers for handover assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json()
        if not data or 'servers' not in data:
            return api_error('Server information required', 400)
        
        servers = data['servers']
        connection_results = []
        
        for index, server in enumerate(servers):
            server_ip = server.get('ip') or server.get('serverIP')
            
            # Skip test for localhost/127.0.0.1
            if server_ip in ['localhost', '127.0.0.1']:
                result = {
                    'ip': server_ip,
                    'success': True,
                    'message': 'Local connection (no SSH required)',
                    'serverIndex': index
                }
                connection_results.append(result)
                continue
            
            # Get credentials
            admin_username = server.get('admin_username')
            admin_password = server.get('admin_password')
            ssh_port = server.get('sshPort', 22)
            
            if not admin_username or not admin_password:
                result = {
                    'ip': server_ip,
                    'success': False,
                    'message': 'Missing SSH credentials (admin_username/admin_password)',
                    'serverIndex': index
                }
                connection_results.append(result)
                continue
            
            # Test SSH connection
            success, message = test_ssh_connection(server_ip, admin_username, admin_password, ssh_port)
            
            result = {
                'ip': server_ip,
                'success': success,
                'message': message,
                'serverIndex': index
            }
            connection_results.append(result)
        
        return api_response({
            'results': connection_results
        })
        
    except Exception as e:
        logger.error(f"Error testing connections: {str(e)}")
        return api_error('Failed to test connections', 500)

@assessments_bp.route('/handover/start', methods=['POST'])
@jwt_required()
def start_handover_assessment():
    """Start handover assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json()
        if not data or 'mop_id' not in data or 'servers' not in data:
            return api_error('MOP ID and server information required', 400)
        
        mop_id = data['mop_id']
        servers = data['servers']
        
        # Validate MOP exists and has handover_assessment type
        mop = MOP.query.get_or_404(mop_id)
        if mop.assessment_type != 'handover_assessment':
            return api_error('MOP is not configured for handover assessment', 400)
        
        # Create assessment result record
        assessment = AssessmentResult(
            mop_id=mop_id,
            assessment_type='handover',
            server_info=servers,
            status='pending',
            executed_by=current_user.id
        )
        
        db.session.add(assessment)
        db.session.commit()
        
        # Use JobManager for automatic fallback between Redis and sync execution
        from services.jobs.job_manager import job_manager
        job_result = job_manager.enqueue_assessment(
            assessment_id=assessment.id,
            mop_id=mop_id,
            servers=servers,
            assessment_label='Handover'
        )
        
        job_id = job_result['job_id']
        mode = job_result['mode']
        status = job_result['status']
        
        logger.info(f"Handover assessment started with job ID: {job_id}, mode: {mode}, status: {status}")
        
        # Update assessment status if completed synchronously
        if mode == 'sync' and status in ['completed', 'failed']:
            assessment.status = 'completed' if status == 'completed' else 'failed'
            db.session.commit()
        
        # Log assessment creation
        log_user_activity(
            user_id=current_user.id,
            username=current_user.username,
            action=ActionType.CREATE,
            resource_type=ResourceType.ASSESSMENT,
            resource_id=assessment.id,
            resource_name=f"Handover Assessment for MOP {mop.name}",
            details={
                'assessment_type': 'handover',
                'mop_id': mop.id,
                'mop_name': mop.name,
                'server_count': len(data.get('servers', []))
            }
        )
        
        return api_response({
            'assessment_id': assessment.id,
            'job_id': job_id,
            'mode': mode,
            'status': status,
            'message': f'Handover assessment started in {mode} mode'
        })
        
    except Exception as e:
        logger.error(f"Error starting handover assessment: {str(e)}")
        return api_error('Failed to start handover assessment', 500)

@assessments_bp.route('/handover/job-status/<job_id>', methods=['GET'])
@jwt_required()
def get_handover_job_status(job_id):
    """Get handover assessment job status and progress"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Resolve job id mapping (RQ <-> Ansible) similar to SSE
        from services.jobs.job_map import resolve_job_id
        resolved_id = resolve_job_id(job_id)

        # Try database first, then Redis fallback
        job_status = get_job_status_from_database(job_id, resolved_id)
        if job_status:
            logger.info(f"Handover Job {job_id} status: {job_status['status']}, detailed_progress: {job_status['detailed_progress']}")
            return jsonify(job_status)

        # Use JobManager to get job status with fallback handling
        from services.jobs.job_manager import job_manager
        job_status = job_manager.get_job_status(resolved_id)
        
        # Also try to get logs from ansible runner for detailed progress
        job_logs = ansible_runner.get_job_logs(resolved_id)
        
        response_data = {
            'job_id': job_id,
            'status': 'pending',
            'progress': None,
            'logs': [],
            'detailed_progress': {
                'current_command': 0,
                'total_commands': 0,
                'current_server': 0,
                'total_servers': 0,
                'percentage': 0
            }
        }
        
        if job_status:
            response_data['status'] = job_status.get('status', 'pending')
            response_data['progress'] = job_status.get('progress')
            
            # Add detailed progress information
            if 'detailed_progress' in job_status:
                response_data['detailed_progress'] = job_status['detailed_progress']

            # Normalize percentage when missing/zero but job is running
            dp = response_data.get('detailed_progress') or {}
            if response_data['status'] == 'running':
                total_commands = max(0, int(dp.get('total_commands') or 0))
                total_servers = max(1, int(dp.get('total_servers') or 1))
                current_command = max(0, int(dp.get('current_command') or 0))
                current_server = max(0, int(dp.get('current_server') or 0))
                percentage_val = float(dp.get('percentage') or 0)
                if percentage_val <= 0 and total_commands > 0:
                    total_tasks = max(1, total_commands * total_servers)
                    completed_tasks = max(0, (current_command - 1) * total_servers + max(0, current_server - 1))
                    percentage_val = round(min(99.0, max(5.0, (completed_tasks / total_tasks) * 100.0)))
                # update back
                response_data['detailed_progress'] = {
                    'current_command': current_command or 1,
                    'total_commands': total_commands,
                    'current_server': current_server or 1,
                    'total_servers': total_servers,
                    'percentage': percentage_val
                }
            
            # Log detailed progress for debugging
            logger.info(f"Handover Job {job_id} status: {job_status.get('status')}, detailed_progress: {job_status.get('detailed_progress')}")

        # If still not found or missing progress, try direct AnsibleRunner status (same instance as logs)
        try:
            if response_data.get('status') in [None, 'not_found'] or not response_data.get('detailed_progress'):
                runner_status = ansible_runner.get_job_status(resolved_id)
                if runner_status:
                    response_data['status'] = runner_status.get('status', response_data['status'])
                    dp2 = (runner_status.get('detailed_progress') or {})
                    if dp2:
                        response_data['detailed_progress'] = dp2
        except Exception as _:
            pass
        
        if job_logs and job_logs.get('log_content'):
            # Split logs into lines and get recent ones
            log_lines = job_logs['log_content'].split('\n')
            response_data['logs'] = [line for line in log_lines if line.strip()][-20:]  # Last 20 lines
            response_data['last_updated'] = job_logs.get('last_updated')
            
            # Extract assessment summary if job is completed
            if job_status and job_status.get('status') == 'completed':
                try:
                    # Look for assessment summary in logs
                    summary_start = -1
                    for i, line in enumerate(log_lines):
                        if 'ASSESSMENT SUMMARY' in line:
                            summary_start = i
                            break
                    
                    if summary_start >= 0:
                        summary_lines = []
                        for i in range(summary_start, len(log_lines)):
                            if log_lines[i].strip():
                                summary_lines.append(log_lines[i])
                        response_data['assessment_summary'] = '\n'.join(summary_lines)
                except Exception as e:
                    logger.warning(f"Failed to extract assessment summary: {str(e)}")
        
        return api_response(response_data)
        
    except Exception as e:
        logger.error(f"Error fetching job status: {str(e)}")
        return api_error('Failed to fetch job status', 500)

@assessments_bp.route('/handover/sse/<job_id>', methods=['GET'])
def handover_job_sse(job_id):
    """SSE endpoint for handover assessment progress - no auth required for SSE"""
    return sse_job_stream(job_id)

@assessments_bp.route('/risk/job-status/<job_id>', methods=['GET'])
@jwt_required()
def get_risk_job_status(job_id):
    """Get risk assessment job status and progress"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Resolve job id mapping (RQ <-> Ansible) similar to SSE
        from services.jobs.job_map import resolve_job_id
        resolved_id = resolve_job_id(job_id)

        # Try database first, then Redis fallback
        job_status = get_job_status_from_database(job_id, resolved_id)
        if job_status:
            logger.info(f"Risk Job {job_id} status: {job_status['status']}, detailed_progress: {job_status['detailed_progress']}")
            return jsonify(job_status)

        # Use JobManager to get job status with fallback handling
        from services.jobs.job_manager import job_manager
        job_status = job_manager.get_job_status(resolved_id)
        
        # Also try to get logs from ansible runner for detailed progress
        job_logs = ansible_runner.get_job_logs(resolved_id)
        
        response_data = {
            'job_id': job_id,
            'status': 'pending',
            'progress': None,
            'detailed_progress': None,
            'logs': []
        }
        
        if job_status:
            response_data['status'] = job_status.get('status', 'pending')
            response_data['progress'] = job_status.get('progress')
            response_data['detailed_progress'] = job_status.get('detailed_progress')
            # Normalize percentage when missing/zero but job is running
            dp = response_data.get('detailed_progress') or {}
            if response_data['status'] == 'running' and dp:
                total_commands = max(0, int(dp.get('total_commands') or 0))
                total_servers = max(1, int(dp.get('total_servers') or 1))
                current_command = max(0, int(dp.get('current_command') or 0))
                current_server = max(0, int(dp.get('current_server') or 0))
                percentage = float(dp.get('percentage') or 0)
                if percentage <= 0 and total_commands > 0:
                    total_tasks = total_commands * total_servers
                    completed_tasks = max(0, (current_command - 1) * total_servers + max(0, current_server - 1))
                    percentage = round(min(99.0, max(5.0, (completed_tasks / max(1, total_tasks)) * 100.0)))
                    response_data['detailed_progress'] = {
                        'current_command': current_command or 1,
                        'total_commands': total_commands,
                        'current_server': current_server or 1,
                        'total_servers': total_servers,
                        'percentage': percentage
                    }
            
            # Log detailed progress for debugging
            logger.info(f"Job {job_id} status: {job_status.get('status')}, detailed_progress: {job_status.get('detailed_progress')}")

        # If still not found or missing progress, try direct AnsibleRunner status (same instance as logs)
        try:
            if response_data.get('status') in [None, 'not_found'] or not response_data.get('detailed_progress'):
                runner_status = ansible_runner.get_job_status(resolved_id)
                if runner_status:
                    response_data['status'] = runner_status.get('status', response_data['status'])
                    dp2 = (runner_status.get('detailed_progress') or {})
                    if dp2:
                        response_data['detailed_progress'] = dp2
        except Exception as _:
            pass
        
        if job_logs and job_logs.get('log_content'):
            # Split logs into lines and get recent ones
            log_lines = job_logs['log_content'].split('\n')
            response_data['logs'] = [line for line in log_lines if line.strip()][-20:]  # Last 20 lines
            response_data['last_updated'] = job_logs.get('last_updated')
            
            # Extract assessment summary if job is completed
            if job_status and job_status.get('status') == 'completed':
                try:
                    # Look for assessment summary in logs
                    summary_start = -1
                    for i, line in enumerate(log_lines):
                        if 'ASSESSMENT SUMMARY' in line:
                            summary_start = i
                            break
                    
                    if summary_start >= 0:
                        summary_lines = []
                        for i in range(summary_start, len(log_lines)):
                            if log_lines[i].strip():
                                summary_lines.append(log_lines[i])
                        response_data['assessment_summary'] = '\n'.join(summary_lines)
                except Exception as e:
                    logger.warning(f"Failed to extract assessment summary: {str(e)}")
        
        return api_response(response_data)
        
    except Exception as e:
        logger.error(f"Error fetching risk job status: {str(e)}")
        return api_error('Failed to fetch job status', 500)

@assessments_bp.route('/risk/sse/<job_id>', methods=['GET'])
def risk_job_sse(job_id):
    """SSE endpoint for risk assessment progress - no auth required for SSE"""
    return sse_job_stream(job_id)

@assessments_bp.route('/system/status', methods=['GET'])
@jwt_required()
def get_system_status():
    """Get system status including Redis availability and job queue health"""
    try:
        from services.jobs.job_manager import job_manager
        
        redis_available = job_manager.is_redis_available()
        
        status_info = {
            'redis_available': redis_available,
            'job_mode': 'async' if redis_available else 'sync',
            'timestamp': datetime.now(GMT_PLUS_7).isoformat()
        }
        
        if redis_available:
            try:
                from services.jobs.queue import get_queue
                queue = get_queue()
                status_info['queue_info'] = {
                    'pending_jobs': len(queue),
                    'failed_jobs': len(queue.failed_job_registry),
                    'finished_jobs': len(queue.finished_job_registry)
                }
            except Exception as e:
                status_info['queue_error'] = str(e)
        
        return api_response(status_info)
        
    except Exception as e:
        logger.error(f"Error getting system status: {str(e)}")
        return api_error('Failed to get system status', 500)

@assessments_bp.route('/handover/results/<int:assessment_id>', methods=['GET'])
@jwt_required()
def get_handover_assessment_results(assessment_id):
    """Get handover assessment results"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        assessment = AssessmentResult.query.get_or_404(assessment_id)
        
        # Check permissions
        if current_user.role == 'user' and assessment.executed_by != current_user.id:
            return api_error('Access denied', 403)
        
        # Get real-time logs if assessment is still pending
        result_data = assessment.to_dict()
        if assessment.status == 'pending':
            # Try to get real-time logs from ansible runner
            job_id = f'handover_assessment_{assessment.id}_*'
            # Find the actual job_id by checking running jobs
            for running_job_id in ansible_runner.running_jobs.keys():
                if f'handover_assessment_{assessment.id}_' in running_job_id:
                    job_status = ansible_runner.get_job_status(running_job_id)
                    job_logs = ansible_runner.get_job_logs(running_job_id)
                    
                    if job_logs and job_logs.get('log_content'):
                        result_data['execution_logs'] = job_logs['log_content']
                    
                    if job_status:
                        result_data['job_status'] = job_status
                    break
        
        return api_response(result_data)
        
    except Exception as e:
        logger.error(f"Error fetching assessment results: {str(e)}")
        return api_error('Failed to fetch assessment results', 500)

@assessments_bp.route('/template/download', methods=['GET'])
@jwt_required()
def download_server_template():
    """Download server information template"""
    try:
        # Create a temporary Excel file with template
        import pandas as pd
        
        template_data = {
            'IP': ['192.168.1.100', '192.168.1.101'],
            'SSH_Port': [22, 22],
            'SSH_User': ['admin', 'admin'],
            'SSH_Password': ['password123', 'password456'],
            'Sudo_User': ['root', 'root'],
            'Sudo_Password': ['rootpass123', 'rootpass456']
        }
        
        df = pd.DataFrame(template_data)
        
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(mode='wb', suffix='.xlsx', delete=False)
        df.to_excel(temp_file.name, index=False)
        temp_file.close()
        
        return send_file(
            temp_file.name,
            as_attachment=True,
            download_name='server_template.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        logger.error(f"Error creating template: {str(e)}")
        return api_error('Failed to create template', 500)

@assessments_bp.route('/handover/download/<int:assessment_id>', methods=['GET'])
@jwt_required()
def download_handover_assessment_report(assessment_id):
    """Download handover assessment report as Excel"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        assessment = AssessmentResult.query.get_or_404(assessment_id)
        
        # Check permissions
        if current_user.role == 'user' and assessment.executed_by != current_user.id:
            return api_error('Access denied', 403)
        
        if assessment.status != 'success':
            return api_error('Assessment not completed yet', 400)
        
        # Import excel exporter
        from services.excel_exporter import ExcelExporter
        
        # Prepare data for Excel export
        export_data = {
            'assessment_id': assessment.id,
            'assessment_type': assessment.assessment_type,
            'created_at': assessment.created_at.isoformat() if assessment.created_at else None,
            'completed_at': assessment.completed_at.isoformat() if assessment.completed_at else None,
            'results': []
        }
        
        # Get MOP details for command titles
        mop = MOP.query.get(assessment.mop_id)
        
        # Convert test_results to the format expected by excel exporter
        if assessment.test_results:
            for result in assessment.test_results:
                # Check if command was skipped
                is_skipped = result.get('skipped', False)
                skip_reason = result.get('skip_reason', '')
                
                if is_skipped:
                    # Handle skipped commands
                    result_data = {
                        'server_ip': result.get('server_ip', ''),
                        'command_title': f"Command {result.get('command_index', 0) + 1}",
                        'command': result.get('command_text', ''),
                        'expected_output': result.get('reference_value', ''),
                        'comparator_method': result.get('comparator_method', ''),
                        'actual_output': result.get('output', ''),
                        'validation_type': 'exact_match',
                        'is_valid': True,  # Skipped commands are considered valid
                        'score': 100.0,  # Skipped commands get full score
                        'details': skip_reason or 'Command was skipped',
                        'skipped': True,
                        'skip_reason': skip_reason,
                        'decision': 'OK (skipped)'
                    }
                    
                    # Add skip condition info if available
                    if result.get('skip_condition_result'):
                        condition_parts = result['skip_condition_result'].split(':')
                        if len(condition_parts) == 2:
                            result_data['skip_condition'] = {
                                'condition_id': condition_parts[0],
                                'condition_type': condition_parts[1]
                            }
                else:
                    # Handle normal commands
                    validation_result = result.get('validation_result', '')
                    if not validation_result:
                        # Fallback to result field if validation_result is missing
                        validation_result = 'OK' if result.get('result') == 'success' else 'Not OK'
                    
                    is_valid = validation_result == 'OK'
                    decision = validation_result  # Use validation_result as decision
                    
                    result_data = {
                        'server_ip': result.get('server_ip', ''),
                        'command_title': f"Command {result.get('command_index', 0) + 1}",
                        'command': result.get('command_text', ''),
                        'expected_output': result.get('reference_value', ''),
                        'comparator_method': result.get('comparator_method', ''),
                        'actual_output': result.get('output', ''),
                        'validation_type': 'exact_match',
                        'is_valid': is_valid,
                        'score': 100.0 if is_valid else 0.0,
                        'details': 'Command executed successfully' if is_valid else 'Command execution failed',
                        'skipped': False,
                        'decision': decision
                    }
                
                export_data['results'].append(result_data)
        
        # Create Excel file
        exporter = ExcelExporter()
        # TODO: detect locale from user preference/header if available
        try:
            user_locale = request.headers.get('X-Locale') or 'en'
            exporter.set_locale(user_locale)
        except Exception:
            pass
        timestamp = datetime.now(GMT_PLUS_7).strftime("%Y%m%d_%H%M%S")
        filename = f"handover_assessment_{assessment_id}_{timestamp}.xlsx"
        
        # Ensure exports directory exists
        os.makedirs('exports', exist_ok=True)
        
        filepath = exporter.export_execution_results(export_data, filename)
        
        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        logger.error(f"Error downloading handover assessment report {assessment_id}: {str(e)}")
        return api_error('Failed to download report', 500)

@assessments_bp.route('/risk/download/<int:assessment_id>', methods=['GET'])
@jwt_required()
def download_risk_assessment_report(assessment_id):
    """Download risk assessment report as Excel"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        assessment = AssessmentResult.query.get_or_404(assessment_id)
        
        # Check permissions
        if current_user.role == 'user' and assessment.executed_by != current_user.id:
            return api_error('Access denied', 403)
        
        if assessment.status != 'success':
            return api_error('Assessment not completed yet', 400)
        
        # Import excel exporter
        from services.excel_exporter import ExcelExporter
        
        # Prepare data for Excel export
        export_data = {
            'assessment_id': assessment.id,
            'assessment_type': assessment.assessment_type,
            'created_at': assessment.created_at.isoformat() if assessment.created_at else None,
            'completed_at': assessment.completed_at.isoformat() if assessment.completed_at else None,
            'results': []
        }
        
        # Get MOP details for command titles
        mop = MOP.query.get(assessment.mop_id)
        
        # Convert test_results to the format expected by excel exporter
        if assessment.test_results:
            for result in assessment.test_results:
                # Check if command was skipped
                is_skipped = result.get('skipped', False)
                skip_reason = result.get('skip_reason', '')
                
                if is_skipped:
                    # Handle skipped commands
                    result_data = {
                        'server_ip': result.get('server_ip', ''),
                        'command_title': f"Command {result.get('command_index', 0) + 1}",
                        'command': result.get('command_text', ''),
                        'expected_output': result.get('reference_value', ''),
                        'comparator_method': result.get('comparator_method', ''),
                        'actual_output': result.get('output', ''),
                        'validation_type': 'exact_match',
                        'is_valid': True,  # Skipped commands are considered valid
                        'score': 100.0,  # Skipped commands get full score
                        'details': skip_reason or 'Command was skipped',
                        'skipped': True,
                        'skip_reason': skip_reason,
                        'decision': 'OK (skipped)'
                    }
                    
                    # Add skip condition info if available
                    if result.get('skip_condition_result'):
                        condition_parts = result['skip_condition_result'].split(':')
                        if len(condition_parts) == 2:
                            result_data['skip_condition'] = {
                                'condition_id': condition_parts[0],
                                'condition_type': condition_parts[1]
                            }
                else:
                    # Handle normal commands
                    is_valid = result.get('result') == 'success'
                    result_data = {
                        'server_ip': result.get('server_ip', ''),
                        'command_title': f"Command {result.get('command_index', 0) + 1}",
                        'command': result.get('command_text', ''),
                        'expected_output': result.get('reference_value', ''),
                        'comparator_method': result.get('comparator_method', ''),
                        'actual_output': result.get('output', ''),
                        'validation_type': 'exact_match',
                        'is_valid': is_valid,
                        'score': 100.0 if is_valid else 0.0,
                        'details': 'Command executed successfully' if is_valid else 'Command execution failed',
                        'skipped': False,
                        'decision': 'APPROVED' if is_valid else 'REJECTED'
                    }
                
                export_data['results'].append(result_data)
        
        # Create Excel file
        exporter = ExcelExporter()
        try:
            user_locale = request.headers.get('X-Locale') or 'en'
            exporter.set_locale(user_locale)
        except Exception:
            pass
        timestamp = datetime.now(GMT_PLUS_7).strftime("%Y%m%d_%H%M%S")
        filename = f"risk_assessment_{assessment_id}_{timestamp}.xlsx"
        
        # Ensure exports directory exists
        os.makedirs('exports', exist_ok=True)
        
        filepath = exporter.export_execution_results(export_data, filename)
        
        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        logger.error(f"Error downloading risk assessment report {assessment_id}: {str(e)}")
        return api_error('Failed to download report', 500)

# Periodic Assessment Endpoints

@assessments_bp.route('/periodic', methods=['GET'])
@jwt_required()
def get_periodic_assessments():
    """Get list of periodic assessments"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Build query
        query = PeriodicAssessment.query
        
        # Apply role-based filtering
        if current_user.role == 'user':
            query = query.filter(PeriodicAssessment.created_by == current_user.id)
        
        # Apply filters
        assessment_type = request.args.get('assessment_type')
        if assessment_type:
            query = query.filter(PeriodicAssessment.assessment_type == assessment_type)
        
        status = request.args.get('status')
        if status:
            query = query.filter(PeriodicAssessment.status == status)
        
        # Order by created_at (most recent first)
        periodic_assessments = query.order_by(desc(PeriodicAssessment.created_at)).all()
        
        return api_response({
            'periodic_assessments': [pa.to_dict() for pa in periodic_assessments]
        })
        
    except Exception as e:
        logger.error(f"Error fetching periodic assessments: {str(e)}")
        return api_error('Failed to fetch periodic assessments', 500)

@assessments_bp.route('/periodic', methods=['POST'])
@jwt_required()
def create_periodic_assessment():
    """Create a new periodic assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json()
        if not data:
            return api_error('No data provided', 400)
        
        # Validate required fields
        required_fields = ['mop_id', 'assessment_type', 'frequency', 'execution_time', 'servers']
        for field in required_fields:
            if field not in data:
                return api_error(f'Missing required field: {field}', 400)
        
        # Validate MOP exists
        mop = MOP.query.get(data['mop_id'])
        if not mop:
            return api_error('MOP not found', 404)
        
        # Validate frequency (allow extended values: daily|weekly|monthly|quarterly)
        try:
            frequency = PeriodicFrequency(data['frequency'])
        except ValueError:
            return api_error('Invalid frequency', 400)
        
        # Create periodic assessment
        periodic_assessment = PeriodicAssessment(
            mop_id=data['mop_id'],
            assessment_type=data['assessment_type'],
            frequency=frequency,
            # execution_time supports options: "HH:MM;wd=1,3,5;dom=10,20"
            execution_time=data['execution_time'],
            server_info=data['servers'],
            created_by=current_user.id
        )
        
        db.session.add(periodic_assessment)
        db.session.commit()
        
        # Log activity
        log_user_activity(
            current_user.id,
            ActionType.CREATE,
            ResourceType.ASSESSMENT,
            periodic_assessment.id,
            f"Created periodic {data['assessment_type']} assessment for MOP {mop.name}"
        )
        
        return api_response({
            'periodic_assessment': periodic_assessment.to_dict(),
            'message': 'Periodic assessment created successfully'
        })
        
    except Exception as e:
        logger.error(f"Error creating periodic assessment: {str(e)}")
        return api_error('Failed to create periodic assessment', 500)

@assessments_bp.route('/periodic/<int:periodic_id>', methods=['PUT'])
@jwt_required()
def update_periodic_assessment(periodic_id):
    """Update periodic assessment status"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        periodic_assessment = PeriodicAssessment.query.get_or_404(periodic_id)
        
        # Check permissions
        if current_user.role == 'user' and periodic_assessment.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        data = request.get_json()
        if not data:
            return api_error('No data provided', 400)
        
        # Update status if provided
        if 'status' in data:
            try:
                new_status = PeriodicStatus(data['status'])
                periodic_assessment.status = new_status
                periodic_assessment.updated_at = datetime.now(GMT_PLUS_7)
            except ValueError:
                return api_error('Invalid status', 400)
        
        db.session.commit()
        
        # Log activity
        log_user_activity(
            current_user.id,
            ActionType.UPDATE,
            ResourceType.ASSESSMENT,
            periodic_assessment.id,
            f"Updated periodic assessment status to {periodic_assessment.status.value}"
        )
        
        return api_response({
            'periodic_assessment': periodic_assessment.to_dict(),
            'message': 'Periodic assessment updated successfully'
        })
        
    except Exception as e:
        logger.error(f"Error updating periodic assessment: {str(e)}")
        return api_error('Failed to update periodic assessment', 500)

@assessments_bp.route('/periodic/<int:periodic_id>', methods=['DELETE'])
@jwt_required()
def delete_periodic_assessment(periodic_id):
    """Delete periodic assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        periodic_assessment = PeriodicAssessment.query.get_or_404(periodic_id)
        
        # Check permissions
        if current_user.role == 'user' and periodic_assessment.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        mop_name = periodic_assessment.mop.name if periodic_assessment.mop else 'Unknown MOP'
        
        db.session.delete(periodic_assessment)
        db.session.commit()
        
        # Log activity
        log_user_activity(
            current_user.id,
            ActionType.DELETE,
            ResourceType.ASSESSMENT,
            periodic_id,
            f"Deleted periodic assessment for MOP {mop_name}"
        )
        
        return api_response({
            'message': 'Periodic assessment deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"Error deleting periodic assessment: {str(e)}")
        return api_error('Failed to delete periodic assessment', 500)

@assessments_bp.route('/periodic/<int:periodic_id>/executions', methods=['GET'])
@jwt_required()
def get_periodic_assessment_executions(periodic_id):
    """Get execution history for a periodic assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        periodic_assessment = PeriodicAssessment.query.get_or_404(periodic_id)
        
        # Check permissions
        if current_user.role == 'user' and periodic_assessment.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        # Get limit from query params (default 5 for recent executions)
        limit = request.args.get('limit', 5, type=int)
        limit = min(limit, 50)  # Max 50 items
        
        # Get recent executions
        executions = PeriodicAssessmentExecution.query.filter_by(
            periodic_assessment_id=periodic_id
        ).order_by(desc(PeriodicAssessmentExecution.created_at)).limit(limit).all()
        
        return api_response({
            'executions': [execution.to_dict() for execution in executions],
            'periodic_assessment': periodic_assessment.to_dict()
        })
        
    except Exception as e:
        logger.error(f"Error fetching periodic assessment executions: {str(e)}")
        return api_error('Failed to fetch executions', 500)

@assessments_bp.route('/periodic/<int:periodic_id>/start', methods=['POST'])
@jwt_required()
def start_periodic_assessment(periodic_id):
    """Start a periodic assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        periodic_assessment = PeriodicAssessment.query.get_or_404(periodic_id)
        
        # Check permissions
        if current_user.role == 'user' and periodic_assessment.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        # Check if already active
        if periodic_assessment.status == PeriodicStatus.ACTIVE:
            return api_error('Periodic assessment is already active', 400)
        
        # Update status to active
        periodic_assessment.status = PeriodicStatus.ACTIVE
        
        # Calculate next execution time
        from services.periodic_scheduler import calculate_next_execution
        periodic_assessment.next_execution = calculate_next_execution(
            periodic_assessment.frequency,
            periodic_assessment.execution_time
        )
        
        db.session.commit()
        
        # Log activity
        log_user_activity(
            user_id=current_user.id,
            action=ActionType.UPDATE,
            resource_type=ResourceType.ASSESSMENT,
            resource_id=periodic_id,
            resource_name=f"Periodic {periodic_assessment.assessment_type} assessment",
            details={
                'action': 'start',
                'mop_id': periodic_assessment.mop_id,
                'frequency': periodic_assessment.frequency.value,
                'next_execution': periodic_assessment.next_execution.isoformat() if periodic_assessment.next_execution else None
            }
        )
        
        return api_response({
            'message': 'Periodic assessment started successfully',
            'periodic_assessment': periodic_assessment.to_dict()
        })
        
    except Exception as e:
        logger.error(f"Error starting periodic assessment: {str(e)}")
        return api_error('Failed to start periodic assessment', 500)

@assessments_bp.route('/periodic/<int:periodic_id>/pause', methods=['POST'])
@jwt_required()
def pause_periodic_assessment(periodic_id):
    """Pause a periodic assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        periodic_assessment = PeriodicAssessment.query.get_or_404(periodic_id)
        
        # Check permissions
        if current_user.role == 'user' and periodic_assessment.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        # Check if already paused or inactive
        if periodic_assessment.status == PeriodicStatus.PAUSED:
            return api_error('Periodic assessment is already paused', 400)
        
        if periodic_assessment.status == PeriodicStatus.INACTIVE:
            return api_error('Cannot pause inactive periodic assessment', 400)
        
        # Update status to paused
        periodic_assessment.status = PeriodicStatus.PAUSED
        db.session.commit()
        
        # Log activity
        log_user_activity(
            user_id=current_user.id,
            action=ActionType.UPDATE,
            resource_type=ResourceType.ASSESSMENT,
            resource_id=periodic_id,
            resource_name=f"Periodic {periodic_assessment.assessment_type} assessment",
            details={
                'action': 'pause',
                'mop_id': periodic_assessment.mop_id,
                'frequency': periodic_assessment.frequency.value
            }
        )
        
        return api_response({
            'message': 'Periodic assessment paused successfully',
            'periodic_assessment': periodic_assessment.to_dict()
        })
        
    except Exception as e:
        logger.error(f"Error pausing periodic assessment: {str(e)}")
        return api_error('Failed to pause periodic assessment', 500)

@assessments_bp.route('/periodic/<int:periodic_id>/stop', methods=['POST'])
@jwt_required()
def stop_periodic_assessment(periodic_id):
    """Stop a periodic assessment"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        periodic_assessment = PeriodicAssessment.query.get_or_404(periodic_id)
        
        # Check permissions
        if current_user.role == 'user' and periodic_assessment.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        # Check if already inactive
        if periodic_assessment.status == PeriodicStatus.INACTIVE:
            return api_error('Periodic assessment is already stopped', 400)
        
        # Update status to inactive
        periodic_assessment.status = PeriodicStatus.INACTIVE
        periodic_assessment.next_execution = None
        db.session.commit()
        
        # Log activity
        log_user_activity(
            user_id=current_user.id,
            action=ActionType.UPDATE,
            resource_type=ResourceType.ASSESSMENT,
            resource_id=periodic_id,
            resource_name=f"Periodic {periodic_assessment.assessment_type} assessment",
            details={
                'action': 'stop',
                'mop_id': periodic_assessment.mop_id,
                'frequency': periodic_assessment.frequency.value
            }
        )
        
        return api_response({
            'message': 'Periodic assessment stopped successfully',
            'periodic_assessment': periodic_assessment.to_dict()
        })
        
    except Exception as e:
        logger.error(f"Error stopping periodic assessment: {str(e)}")
        return api_error('Failed to stop periodic assessment', 500)

@assessments_bp.route('/history', methods=['GET'])
@jwt_required()
def get_assessment_history():
    """Get assessment job history"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('page_size', 10, type=int)
        status = request.args.get('status')
        assessment_type = request.args.get('assessment_type')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        
        # Build query - use JobTracking table instead of AssessmentResult
        from models.job_tracking import JobTracking
        query = JobTracking.query
        
        # Apply role-based filtering
        if current_user.role == 'user':
            query = query.filter(JobTracking.user_id == current_user.id)
        
        # Apply filters
        if status:
            query = query.filter(JobTracking.status == status)
        
        if assessment_type:
            query = query.filter(JobTracking.job_type == assessment_type)
        
        if date_from:
            try:
                date_from_obj = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                query = query.filter(JobTracking.created_at >= date_from_obj)
            except ValueError:
                pass
        
        if date_to:
            try:
                date_to_obj = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                query = query.filter(JobTracking.created_at <= date_to_obj)
            except ValueError:
                pass
        
        # Order by creation date (newest first)
        query = query.order_by(desc(JobTracking.created_at))
        
        # Paginate
        pagination = query.paginate(
            page=page,
            per_page=page_size,
            error_out=False
        )
        
        # Format results
        jobs = []
        for job_tracking in pagination.items:
            mop = MOP.query.get(job_tracking.mop_id) if job_tracking.mop_id else None
            user = User.query.get(job_tracking.user_id) if job_tracking.user_id else None
            
            # Calculate duration if completed
            duration = None
            if job_tracking.completed_at and job_tracking.created_at:
                duration = int((job_tracking.completed_at - job_tracking.created_at).total_seconds())
            
            jobs.append({
                'id': job_tracking.job_id,
                'assessment_id': job_tracking.assessment_id,
                'assessment_type': job_tracking.job_type,
                'status': job_tracking.status,
                'created_at': job_tracking.created_at.isoformat(),
                'completed_at': job_tracking.completed_at.isoformat() if job_tracking.completed_at else None,
                'duration': duration,
                'server_count': job_tracking.total_servers,
                'command_count': job_tracking.total_commands,
                'mop_title': mop.name if mop else 'Unknown MOP',
                'user_name': user.username if user else 'Unknown User',
                'error_message': job_tracking.error_message
            })
        
        return api_response({
            'jobs': jobs,
            'total': pagination.total,
            'page': page,
            'page_size': page_size,
            'total_pages': pagination.pages
        })
        
    except Exception as e:
        logger.error(f"Error getting assessment history: {str(e)}")
        return api_error('Failed to get assessment history', 500)
