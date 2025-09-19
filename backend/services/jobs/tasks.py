from typing import Dict, Any
from datetime import datetime, timezone, timedelta
from services.ansible_manager import AnsibleRunner
from services.jobs.job_map import set_job_mapping
from models import db
from models.assessment import AssessmentResult
from models.mop import MOP

GMT_PLUS_7 = timezone(timedelta(hours=7))

def run_assessment_task(assessment_id: int, mop_id: int, servers: list, assessment_label: str):
    """
    Background task to run assessment using AnsibleRunner and persist results
    assessment_label: "Risk" | "Handover"
    """
    # Get current RQ job context to get the RQ job ID
    from rq import get_current_job
    current_job = get_current_job()
    rq_job_id = current_job.id if current_job else None
    
    runner = AnsibleRunner()
    assessment = AssessmentResult.query.get(assessment_id)
    mop = MOP.query.get(mop_id)
    if not assessment or not mop:
        return {'status': 'failed', 'message': 'Assessment/MOP not found'}

    # Build commands
    commands = []
    for command in mop.commands:
        cmd_id = getattr(command, 'command_id_ref', None) or getattr(command, 'command_id', None) or getattr(command, 'id', None)
        order_idx = getattr(command, 'order_index', None)
        commands.append({
            'title': command.title or command.description or f'Command {command.order_index}',
            'command': command.command or command.command_text,
            'reference_value': command.reference_value or command.expected_output or '',
            'comparator_method': command.comparator_method or 'eq',
            'validation_type': 'exact_match',
            'command_id_ref': str(cmd_id) if cmd_id is not None else None,
            'order_index': int(order_idx) if order_idx is not None else None,
            'skip_condition': {
                'condition_id': command.skip_condition_id,
                'condition_type': command.skip_condition_type,
                'condition_value': command.skip_condition_value
            } if (command.skip_condition_id or command.skip_condition_type) else None
        })

    ansible_servers = []
    for server in servers:
        ansible_servers.append({
            'ip': server.get('serverIP', server.get('ip')),
            'admin_username': server.get('adminUsername', server.get('admin_username', 'admin')),
            'admin_password': server.get('adminPassword', server.get('admin_password', '')),
            'root_username': server.get('rootUsername', server.get('root_username', 'root')),
            'root_password': server.get('rootPassword', server.get('root_password', ''))
        })

    timestamp = datetime.now(GMT_PLUS_7).strftime('%H%M%S_%d%m%Y')
    ansible_job_id = f'{assessment_label.lower()}_assessment_{assessment_id}_{timestamp}'
    
    # Use RQ job ID as the primary job ID if available, otherwise use ansible job ID
    job_id = rq_job_id if rq_job_id else ansible_job_id
    
    # Persist mapping in Redis so SSE/status resolvers can translate both ways
    if rq_job_id and rq_job_id != ansible_job_id:
        try:
            set_job_mapping(rq_job_id, ansible_job_id)
        except Exception:
            # Mapping best-effort; don't fail task if Redis not available
            pass

    runner.run_playbook(job_id, commands, ansible_servers, timestamp, execution_id=assessment_id, assessment_type=assessment_label, user_id=assessment.executed_by, mop_id=mop_id)

    # Poll until completion (simple loop; can be optimized)
    import time
    max_wait = 300
    waited = 0
    while waited < max_wait:
        status = runner.get_job_status(job_id)
        if status and status.get('status') in ['completed', 'failed']:
            break
        time.sleep(5)
        waited += 5

    results = runner.get_job_results(job_id)
    logs_data = runner.get_job_logs(job_id)
    execution_logs = logs_data.get('log_content') if logs_data and logs_data.get('log_content') else ''

    try:
        if results and 'servers' in results:
            test_results = []
            for server_ip, server_result in results['servers'].items():
                if 'commands' in server_result:
                    for cmd_idx, cmd_result in enumerate(server_result['commands']):
                        is_skipped = cmd_result.get('skipped', False)
                        validation_result = cmd_result.get('validation_result', '')
                        decision = cmd_result.get('decision', '')
                        is_valid = cmd_result.get('is_valid', False)
                        if is_skipped:
                            validation_result = 'OK (skipped)'
                            decision = 'OK (skipped)'
                            is_valid = True
                        elif not validation_result or validation_result == 'N/A':
                            if cmd_result.get('success', False):
                                validation_result = 'OK'
                                decision = 'APPROVED'
                                is_valid = True
                            else:
                                validation_result = 'Not OK'
                                decision = 'REJECTED'
                                is_valid = False
                        test_results.append({
                            'server_index': 0,
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
                            'comparator_method': cmd_result.get('comparator_method', ''),
                            'command_id_ref': cmd_result.get('command_id_ref', ''),
                            'skip_condition': cmd_result.get('skip_condition_result', ''),
                            'recommendations': cmd_result.get('recommendations', [])
                        })
            assessment.test_results = test_results
            assessment.execution_logs = execution_logs
            assessment.status = 'success'
            assessment.completed_at = datetime.now(GMT_PLUS_7)
            db.session.commit()
        else:
            assessment.execution_logs = execution_logs
            assessment.status = 'fail'
            assessment.error_message = 'No results returned from ansible'
            assessment.completed_at = datetime.now(GMT_PLUS_7)
            db.session.commit()
    except Exception as e:
        assessment.status = 'fail'
        assessment.error_message = str(e)
        assessment.execution_logs = execution_logs
        assessment.completed_at = datetime.now(GMT_PLUS_7)
        db.session.commit()

    return {'status': assessment.status, 'assessment_id': assessment_id, 'job_id': job_id}


