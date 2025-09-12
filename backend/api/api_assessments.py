from flask import Blueprint, request, send_file, current_app
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
from models.audit_log import ActionType, ResourceType
import logging
import os
import tempfile
import threading
import time
import paramiko
import socket

logger = logging.getLogger(__name__)

assessments_bp = Blueprint('assessments', __name__, url_prefix='/api/assessments')
ansible_runner = AnsibleRunner()

# Note: Rate limiting exemption is handled in app.py via limiter.exempt()

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
    """Start risk assessment"""
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
        
        # Run real assessment using Ansible
        import threading
        from services.ansible_manager import AnsibleRunner
        from datetime import datetime as dt
        
        # Get the current app instance for the thread
        app = current_app._get_current_object()
        
        def run_real_assessment():
            # Create application context for the thread
            with app.app_context():
                try:
                    # Re-fetch the assessment and MOP objects within the new context
                    assessment_obj = AssessmentResult.query.get(assessment.id)
                    mop_obj = MOP.query.get(mop_id)
                    
                    # Prepare commands for ansible
                    commands = []
                    for command in mop_obj.commands:
                        # Preserve original IDs from MOP for smart execution
                        cmd_id = getattr(command, 'command_id_ref', None)
                        if cmd_id is None:
                            cmd_id = getattr(command, 'command_id', None)
                        if cmd_id is None and hasattr(command, 'id'):
                            cmd_id = getattr(command, 'id')
                        order_idx = getattr(command, 'order_index', None)

                        command_dict = {
                            'title': command.title or command.description or f'Command {command.order_index}',
                            'command': command.command or command.command_text,
                            'reference_value': command.reference_value or command.expected_output or '',
                            'extract_method': command.extract_method or 'raw',
                            'comparator_method': command.comparator_method or 'eq',
                            'validation_type': 'exact_match',
                            'command_id_ref': str(cmd_id) if cmd_id is not None else None,
                            'order_index': int(order_idx) if order_idx is not None else None
                        }
                        
                        # Add skip condition fields
                        if command.skip_condition_id or command.skip_condition_type:
                            command_dict['skip_condition'] = {
                                'condition_id': command.skip_condition_id,
                                'condition_type': command.skip_condition_type,
                                'condition_value': command.skip_condition_value
                            }
                        
                        commands.append(command_dict)
                    
                    # Prepare servers for ansible
                    ansible_servers = []
                    for server in servers:
                        ansible_servers.append({
                            'ip': server.get('serverIP', server.get('ip')),
                            'admin_username': server.get('adminUsername', server.get('admin_username', 'admin')),
                            'admin_password': server.get('adminPassword', server.get('admin_password', '')),
                            'root_username': server.get('rootUsername', server.get('root_username', 'root')),
                            'root_password': server.get('rootPassword', server.get('root_password', ''))
                        })
                    
                    # Run ansible playbook
                    timestamp = datetime.now().strftime('%H%M%S_%d%m%Y')
                    job_id = f'risk_assessment_{assessment.id}_{timestamp}'
                    
                    logger.info(f"Starting real assessment with job_id: {job_id}")
                    logger.info(f"Starting ansible playbook with job_id: {job_id}, commands: {len(commands)}, servers: {len(ansible_servers)}")
                    ansible_runner.run_playbook(job_id, commands, ansible_servers, timestamp, execution_id=assessment.id, assessment_type="Risk")
                    logger.info(f"Ansible playbook started for assessment {assessment.id}")
                    
                    # Wait for completion and get results
                    import time
                    max_wait = 300  # 5 minutes timeout
                    wait_time = 0
                    
                    while wait_time < max_wait:
                        status = ansible_runner.get_job_status(job_id)
                        if status and status.get('status') in ['completed', 'failed']:
                            break
                        time.sleep(5)
                        wait_time += 5
                    
                    # Get results
                    logger.info(f"Getting results for job_id: {job_id}")
                    results = ansible_runner.get_job_results(job_id)
                    logger.info(f"Results retrieved: {results is not None}")
                    execution_logs = ""
                    
                    # Always try to get logs, even if results failed
                    logger.info(f"Getting logs for job_id: {job_id}")
                    logs_data = ansible_runner.get_job_logs(job_id)
                    if logs_data and logs_data.get('log_content'):
                        execution_logs = logs_data['log_content']
                        logger.info(f"Logs retrieved, length: {len(execution_logs)}")
                    else:
                        logger.warning(f"No logs retrieved for job_id: {job_id}")
                    
                    if results and 'servers' in results:
                        # Convert ansible results to assessment format
                        test_results = []
                        for server_ip, server_result in results['servers'].items():
                            if 'commands' in server_result:
                                for cmd_idx, cmd_result in enumerate(server_result['commands']):
                                    # Determine proper validation_result and decision
                                    is_skipped = cmd_result.get('skipped', False)
                                    validation_result = cmd_result.get('validation_result', '')
                                    decision = cmd_result.get('decision', '')
                                    is_valid = cmd_result.get('is_valid', False)
                                    
                                    # Set proper values based on command status
                                    if is_skipped:
                                        validation_result = 'OK (skipped)'
                                        decision = 'OK (skipped)'
                                        is_valid = True
                                    elif not validation_result or validation_result == 'N/A':
                                        # Fallback to success/failed status if validation_result is missing
                                        if cmd_result.get('success', False):
                                            validation_result = 'OK'
                                            decision = 'APPROVED'
                                            is_valid = True
                                        else:
                                            validation_result = 'Not OK'
                                            decision = 'REJECTED'
                                            is_valid = False
                                    
                                    test_results.append({
                                        'server_index': next(i for i, s in enumerate(servers) if s.get('serverIP', s.get('ip')) == server_ip),
                                        'command_index': cmd_idx,
                                        'server_ip': server_ip,
                                        'command_text': cmd_result['command'],
                                        'result': 'success' if cmd_result['success'] else 'failed',
                                        'output': cmd_result['output'],
                                        'reference_value': cmd_result.get('expected', ''),
                                        'validation_result': validation_result,
                                        'decision': decision,
                                        'is_valid': is_valid,
                                        'skipped': is_skipped,
                                        'skip_reason': cmd_result.get('skip_reason', ''),
                                        'title': cmd_result.get('title', ''),
                                        'extract_method': cmd_result.get('extract_method', ''),
                                        'comparator_method': cmd_result.get('comparator_method', ''),
                                        'command_id_ref': cmd_result.get('command_id_ref', ''),
                                        'skip_condition': cmd_result.get('skip_condition_result', ''),
                                        'recommendations': cmd_result.get('recommendations', [])
                                    })
                        
                        # Update assessment with results
                        assessment_obj.test_results = test_results
                        assessment_obj.execution_logs = execution_logs
                        assessment_obj.status = 'success'
                        assessment_obj.completed_at = datetime.now(GMT_PLUS_7)
                        db.session.commit()
                        logger.info(f"Assessment {assessment.id} completed successfully")
                    else:
                        # Even if no results, save the logs for debugging
                        assessment_obj.execution_logs = execution_logs
                        assessment_obj.status = 'fail'
                        assessment_obj.error_message = "No results returned from ansible"
                        assessment_obj.completed_at = datetime.now(GMT_PLUS_7)
                        db.session.commit()
                        logger.error(f"Assessment {assessment.id} failed: No results returned from ansible")
                        
                except Exception as e:
                    logger.error(f"Error in real assessment: {str(e)}")
                    try:
                        assessment_obj = AssessmentResult.query.get(assessment.id)
                        
                        # Try to get logs even when there's an error
                        execution_logs = ""
                        if 'job_id' in locals():
                            try:
                                logs_data = ansible_runner.get_job_logs(job_id)
                                if logs_data and logs_data.get('log_content'):
                                    execution_logs = logs_data['log_content']
                            except:
                                pass
                        
                        assessment_obj.status = 'fail'
                        assessment_obj.error_message = str(e)
                        assessment_obj.execution_logs = execution_logs
                        assessment_obj.completed_at = datetime.now(GMT_PLUS_7)
                        db.session.commit()
                    except Exception as commit_error:
                        logger.error(f"Error updating failed status: {str(commit_error)}")
        
        # Start real assessment in background
        thread = threading.Thread(target=run_real_assessment)
        thread.daemon = True
        thread.start()
        
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
            'job_id': f'risk_assessment_{assessment.id}_{datetime.now().strftime("%H%M%S_%d%m%Y")}',
            'status': 'started',
            'message': 'Risk assessment started successfully'
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
        
        # Run real assessment using Ansible
        import threading
        from services.ansible_manager import AnsibleRunner
        from datetime import datetime as dt
        
        # Get the current app instance for the thread
        app = current_app._get_current_object()
        
        def run_real_assessment():
            # Create application context for the thread
            with app.app_context():
                try:
                    # Re-fetch the assessment and MOP objects within the new context
                    assessment_obj = AssessmentResult.query.get(assessment.id)
                    mop_obj = MOP.query.get(mop_id)
                    
                    commands = []
                    for command in mop_obj.commands:
                        # Preserve original IDs from MOP for smart execution
                        cmd_id = getattr(command, 'command_id_ref', None)
                        if cmd_id is None:
                            cmd_id = getattr(command, 'command_id', None)
                        if cmd_id is None and hasattr(command, 'id'):
                            cmd_id = getattr(command, 'id')
                        order_idx = getattr(command, 'order_index', None)

                        command_dict = {
                            'title': command.title or command.description or f'Command {command.order_index}',
                            'command': command.command or command.command_text,
                            'reference_value': command.reference_value or command.expected_output or '',
                            'extract_method': command.extract_method or 'raw',
                            'comparator_method': command.comparator_method or 'eq',
                            'validation_type': 'exact_match',
                            'command_id_ref': str(cmd_id) if cmd_id is not None else None,
                            'order_index': int(order_idx) if order_idx is not None else None
                        }
                        
                        # Add skip condition fields
                        if command.skip_condition_id or command.skip_condition_type:
                            command_dict['skip_condition'] = {
                                'condition_id': command.skip_condition_id,
                                'condition_type': command.skip_condition_type,
                                'condition_value': command.skip_condition_value
                            }
                        
                        commands.append(command_dict)
                    
                    # Prepare servers for ansible
                    ansible_servers = []
                    for server in servers:
                        ansible_servers.append({
                            'ip': server.get('serverIP', server.get('ip')),
                            'admin_username': server.get('adminUsername', server.get('admin_username', 'admin')),
                            'admin_password': server.get('adminPassword', server.get('admin_password', '')),
                            'root_username': server.get('rootUsername', server.get('root_username', 'root')),
                            'root_password': server.get('rootPassword', server.get('root_password', ''))
                        })
                    
                    # Run ansible playbook
                    timestamp = dt.now().strftime('%H%M%S_%d%m%Y')
                    job_id = f'handover_assessment_{assessment.id}_{timestamp}'
                    
                    logger.info(f"Starting real handover assessment with job_id: {job_id}")
                    logger.info(f"Starting ansible playbook with job_id: {job_id}, commands: {len(commands)}, servers: {len(ansible_servers)}")
                    ansible_runner.run_playbook(job_id, commands, ansible_servers, timestamp, execution_id=assessment.id, assessment_type="Handover")
                    logger.info(f"Ansible playbook started for handover assessment {assessment.id}")
                    
                    # Wait for completion and get results
                    import time
                    max_wait = 300  # 5 minutes timeout
                    wait_time = 0
                    
                    while wait_time < max_wait:
                        status = ansible_runner.get_job_status(job_id)
                        if status and status.get('status') in ['completed', 'failed']:
                            break
                        time.sleep(5)
                        wait_time += 5
                    
                    # Get results
                    logger.info(f"Getting results for handover job_id: {job_id}")
                    results = ansible_runner.get_job_results(job_id)
                    logger.info(f"Handover results retrieved: {results is not None}")
                    execution_logs = ""
                    
                    # Always try to get logs, even if results failed
                    logger.info(f"Getting logs for handover job_id: {job_id}")
                    logs_data = ansible_runner.get_job_logs(job_id)
                    if logs_data and logs_data.get('log_content'):
                        execution_logs = logs_data['log_content']
                        logger.info(f"Handover logs retrieved, length: {len(execution_logs)}")
                    else:
                        logger.warning(f"No logs retrieved for handover job_id: {job_id}")
                    
                    if results and 'servers' in results:
                        # Convert ansible results to assessment format
                        test_results = []
                        for server_ip, server_result in results['servers'].items():
                            if 'commands' in server_result:
                                for cmd_idx, cmd_result in enumerate(server_result['commands']):
                                    test_results.append({
                                        'server_index': next(i for i, s in enumerate(servers) if s.get('serverIP', s.get('ip')) == server_ip),
                                        'command_index': cmd_idx,
                                        'server_ip': server_ip,
                                        'command_text': cmd_result['command'],
                                        'result': 'success' if cmd_result['success'] else 'failed',
                                        'output': cmd_result['output'],
                                        'reference_value': cmd_result.get('expected', ''),
                                        'validation_result': cmd_result.get('validation_result', 'N/A'),
                                        'decision': cmd_result.get('decision', 'N/A'),
                                        'is_valid': cmd_result.get('is_valid', False),
                                        'skipped': cmd_result.get('skipped', False),
                                        'skip_reason': cmd_result.get('skip_reason', ''),
                                        'title': cmd_result.get('title', ''),
                                        'extract_method': cmd_result.get('extract_method', ''),
                                        'comparator_method': cmd_result.get('comparator_method', ''),
                                        'command_id_ref': cmd_result.get('command_id_ref', ''),
                                        'skip_condition': cmd_result.get('skip_condition_result', ''),
                                        'recommendations': cmd_result.get('recommendations', [])
                                    })
                        
                        # Update assessment with results
                        assessment_obj.test_results = test_results
                        assessment_obj.execution_logs = execution_logs
                        assessment_obj.status = 'success'
                        assessment_obj.completed_at = datetime.now(GMT_PLUS_7)
                        db.session.commit()
                        logger.info(f"Handover assessment {assessment.id} completed successfully")
                    else:
                        # Even if no results, save the logs for debugging
                        assessment_obj.execution_logs = execution_logs
                        assessment_obj.status = 'fail'
                        assessment_obj.error_message = "No results returned from ansible"
                        assessment_obj.completed_at = datetime.now(GMT_PLUS_7)
                        db.session.commit()
                        logger.error(f"Handover assessment {assessment.id} failed: No results returned from ansible")
                        
                except Exception as e:
                    logger.error(f"Error in real handover assessment: {str(e)}")
                    try:
                        assessment_obj = AssessmentResult.query.get(assessment.id)
                        
                        # Try to get logs even when there's an error
                        execution_logs = ""
                        if 'job_id' in locals():
                            try:
                                logs_data = ansible_runner.get_job_logs(job_id)
                                if logs_data and logs_data.get('log_content'):
                                    execution_logs = logs_data['log_content']
                            except:
                                pass
                        
                        assessment_obj.status = 'fail'
                        assessment_obj.error_message = str(e)
                        assessment_obj.execution_logs = execution_logs
                        assessment_obj.completed_at = datetime.now(GMT_PLUS_7)
                        db.session.commit()
                    except Exception as commit_error:
                        logger.error(f"Error updating failed status: {str(commit_error)}")
        
        # Start real assessment in background
        thread = threading.Thread(target=run_real_assessment)
        thread.daemon = True
        thread.start()
        
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
            'job_id': f'handover_assessment_{assessment.id}_{dt.now().strftime("%H%M%S_%d%m%Y")}',
            'status': 'started',
            'message': 'Handover assessment started successfully'
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
        
        # Get job status and logs from ansible runner
        job_status = ansible_runner.get_job_status(job_id)
        job_logs = ansible_runner.get_job_logs(job_id)
        
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
            
            # Log detailed progress for debugging
            logger.info(f"Handover Job {job_id} status: {job_status.get('status')}, detailed_progress: {job_status.get('detailed_progress')}")
        
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

@assessments_bp.route('/risk/job-status/<job_id>', methods=['GET'])
@jwt_required()
def get_risk_job_status(job_id):
    """Get risk assessment job status and progress"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get job status and logs from ansible runner
        job_status = ansible_runner.get_job_status(job_id)
        job_logs = ansible_runner.get_job_logs(job_id)
        
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
            
            # Log detailed progress for debugging
            logger.info(f"Job {job_id} status: {job_status.get('status')}, detailed_progress: {job_status.get('detailed_progress')}")
        
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
        
        # Validate frequency
        try:
            frequency = PeriodicFrequency(data['frequency'])
        except ValueError:
            return api_error('Invalid frequency', 400)
        
        # Create periodic assessment
        periodic_assessment = PeriodicAssessment(
            mop_id=data['mop_id'],
            assessment_type=data['assessment_type'],
            frequency=frequency,
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
