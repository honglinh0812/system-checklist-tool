from ansible_runner import run
import json
import os
import tempfile
import yaml
import re
from datetime import datetime, timezone, timedelta
import logging
from typing import Dict, List, Any, Optional

# GMT+7 timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AnsibleRunner:
    def __init__(self, playbook_dir: str = "./ansible/playbooks"):
        self.playbook_dir = playbook_dir
        self.running_jobs = {}
        self.job_results = {}
        self.job_logs = {}
    
    def _safe_yaml_string(self, command: str) -> str:
        """
        Safely format command string for YAML to prevent parsing errors
        """
        if not command:
            return ""
        
        # Check for special characters that need escaping
        special_chars = ['"', '\\', '\n', '\r', '\t']
        needs_quoting = any(char in command for char in special_chars) or \
                       command.strip() != command or \
                       re.search(r'[{}\[\]:,&*#?|><!%@`]', command)
        
        if needs_quoting:
            # Escape quotes and backslashes
            escaped = command.replace('\\', '\\\\').replace('"', '\\"')
            return f'"{escaped}"'
        
        return command
        
    def create_dynamic_playbook(self, commands: List[Dict], servers: List[Dict]) -> str:
        """Create a dynamic playbook from commands and servers"""
        logger.info(f"Creating dynamic playbook for {len(commands)} commands on {len(servers)} servers")
        
        temp_dir = tempfile.mkdtemp()
        
        inventory_content = {
            "all": {
                "hosts": {},
                "vars": {
                    "ansible_ssh_common_args": "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null",
                    "ansible_connection": "ssh",
                    "ansible_ssh_private_key_file": "~/.ssh/id_rsa",
                    "ansible_become": True,
                    "ansible_become_method": "sudo",
                    "ansible_become_user": "root"
                }
            }
        }
        
        for server in servers:
            ip = server['ip']
            if ip in ['localhost', '127.0.0.1']:
                inventory_content["all"]["hosts"][ip] = {
                    "ansible_connection": "local",
                    "ansible_become": False
                }
            else:
                inventory_content["all"]["hosts"][ip] = {
                    "ansible_user": server['admin_username'],
                    "ansible_password": server['admin_password'],
                    "ansible_become": True,
                    "ansible_become_method": "sudo",
                    "ansible_become_user": "root",
                    "ansible_become_password": server['root_password']
                }
        
        inventory_path = os.path.join(temp_dir, "inventory.yml")
        with open(inventory_path, 'w') as f:
            yaml.dump(inventory_content, f, default_flow_style=False)
        
        # Log inventory details
        logger.info(f"Inventory created with {len(servers)} servers")
        for server in servers:
            ip = server['ip']
            if ip in ['localhost', '127.0.0.1']:
                logger.info(f"  {ip}: local connection (no sudo)")
            else:
                logger.info(f"  {ip}: ssh_user={server['admin_username']}, sudo_user=root")
        
        tasks = []
        for i, cmd in enumerate(commands):
            safe_command = self._safe_yaml_string(cmd['command'])
            task = {
                "name": cmd.get('title', f"Command {i+1}"),
                "shell": safe_command,
                "register": f"result_{i}",
                "ignore_errors": True
            }
            tasks.append(task)
        
        playbook_content = [{
            "name": "Dynamic Commands Execution",
            "hosts": "all",
            "gather_facts": False,
            "tasks": tasks
        }]
        
        playbook_path = os.path.join(temp_dir, "dynamic_commands.yml")
        with open(playbook_path, 'w') as f:
            yaml.dump(playbook_content, f, 
                     default_flow_style=False, 
                     allow_unicode=True, 
                     width=1000, 
                     indent=2)
        
        logger.info(f"Created playbook: {playbook_path}")
        return temp_dir
    
    def run_playbook(self, job_id: str, commands: List[Dict], servers: List[Dict], timestamp: str, execution_id: int = None, assessment_type: str = None):
        """Run playbook and store results"""
        try:
            logger.info(f"Starting job {job_id} with {len(commands)} commands on {len(servers)} servers")
            
            self.running_jobs[job_id] = {
                'status': 'running',
                'start_time': datetime.now(GMT_PLUS_7).isoformat(),
                'commands_count': len(commands),
                'servers_count': len(servers),
                'progress': 0
            }
            
            temp_dir = self.create_dynamic_playbook(commands, servers)
            
            result = run(
                playbook=os.path.join(temp_dir, "dynamic_commands.yml"),
                inventory=os.path.join(temp_dir, "inventory.yml"),
                private_data_dir=temp_dir,
                quiet=False
            )
            
            # Always process results to generate logs, even if there are errors
            results = self._process_results(result, commands, servers, job_id, timestamp, execution_id, assessment_type)
            
            # Get return code safely
            return_code = getattr(result, 'rc', -1) if result else -1
            
            self.running_jobs[job_id].update({
                'status': 'completed',
                'end_time': datetime.now(GMT_PLUS_7).isoformat(),
                'success': return_code == 0
            })
            
            self.job_results[job_id] = results
            
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            
            logger.info(f"Job {job_id} completed with return code {return_code}")
            
        except Exception as e:
            logger.error(f"Error in job {job_id}: {str(e)}")
            
            # Try to process results even when there's an exception
            try:
                if 'result' in locals():
                    results = self._process_results(result, commands, servers, job_id, timestamp, execution_id, assessment_type)
                    self.job_results[job_id] = results
                else:
                    # Create minimal log when no result is available
                    log_content = [
                        f"Job ID: {job_id}",
                        f"Timestamp: {timestamp}",
                        f"Commands: {len(commands)}",
                        f"Servers: {len(servers)}",
                        f"Error: {str(e)}",
                        "No Ansible result available"
                    ]
                    log_filename = f"{timestamp}.txt"
                    log_path = os.path.join("logs", log_filename)
                    os.makedirs("logs", exist_ok=True)
                    with open(log_path, 'w', encoding='utf-8') as f:
                        f.write('\n'.join(log_content))
                    
                    self.job_logs[job_id] = {
                        'log_file': log_path,
                        'log_content': '\n'.join(log_content)
                    }
                    
                    # Create empty results structure to prevent KeyError
                    self.job_results[job_id] = {
                        'servers': {},
                        'summary': {
                            'total_commands': len(commands),
                            'total_servers': len(servers),
                            'success_count': 0,
                            'failed_count': len(commands) * len(servers),
                            'error': str(e)
                        }
                    }
            except Exception as log_error:
                logger.error(f"Error creating logs for failed job {job_id}: {str(log_error)}")
            
            if job_id in self.running_jobs:
                self.running_jobs[job_id].update({
                    'status': 'failed',
                    'end_time': datetime.now(GMT_PLUS_7).isoformat(),
                    'error': str(e)
                })
            
            if 'temp_dir' in locals():
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
    
    def _process_results(self, result: Any, commands: List[Dict], servers: List[Dict], job_id: str, timestamp: str, execution_id: int = None, assessment_type: str = None) -> Dict:
        """Process ansible results and create detailed report"""
        logger.info(f"Processing results for job {job_id}")
        
        # Determine assessment type from parameter or job_id
        if not assessment_type:
            assessment_type = "Risk" if "risk_assessment" in job_id else "Handover"
        
        # Create timestamped directory for this assessment run
        # Format: Risk-HH-MM-SS-DD-MM-YYYY or Handover-HH-MM-SS-DD-MM-YYYY
        now = datetime.now(GMT_PLUS_7)
        dir_timestamp = now.strftime("%H-%M-%S-%d-%m-%Y")
        log_dir_name = f"{assessment_type}-{dir_timestamp}"
        log_dir_path = os.path.join("logs", log_dir_name)
        
        # Ensure logs directory exists
        os.makedirs(log_dir_path, exist_ok=True)
        
        log_filename = f"{timestamp}.txt"
        log_path = os.path.join(log_dir_path, log_filename)
        
        log_content = []
        log_content.append(f"Job ID: {job_id}")
        log_content.append(f"Timestamp: {timestamp}")
        log_content.append(f"Commands: {len(commands)}")
        log_content.append(f"Servers: {len(servers)}")
        
        # Get return code safely
        return_code = getattr(result, 'rc', -1) if result else -1
        log_content.append(f"Return Code: {return_code}")
        
        # Log execution details per server
        localhost_servers = [s for s in servers if s['ip'] in ['localhost', '127.0.0.1']]
        remote_servers = [s for s in servers if s['ip'] not in ['localhost', '127.0.0.1']]
        
        if localhost_servers:
            log_content.append(f"Localhost servers: {len(localhost_servers)} (user privileges)")
        if remote_servers:
            log_content.append(f"Remote servers: {len(remote_servers)} (root via sudo)")
        
        log_content.append("=" * 50)
        
        server_results = {}
        for server in servers:
            ip = server['ip']
            server_results[ip] = {
                'ip': ip,
                'admin_username': server['admin_username'],
                'root_username': server['root_username'],
                'commands': [],
                'status': 'unknown',
                'error': None
            }
            
            log_content.append(f"\nServer: {ip}")
            log_content.append("-" * 30)
            
            if hasattr(result, 'stats') and result.stats and ip in result.stats.get('ok', {}):
                server_results[ip]['status'] = 'success'
                
                for i, cmd in enumerate(commands):
                    cmd_result = {
                        'title': cmd.get('title', f'Command {i+1}'),
                        'command': cmd['command'],
                        'output': '',
                        'error': '',
                        'return_code': None,
                        'success': False,
                        'is_valid': False,
                        'expected': cmd.get('reference_value', ''),
                        'validation_type': cmd.get('validation_type', 'exact_match')
                    }
                    
                    try:
                        if hasattr(result, 'events') and result.events:
                            for event in result.events:
                                if event.get('event') == 'runner_on_ok' and event.get('event_data', {}).get('host') == ip:
                                    task_name = event.get('event_data', {}).get('task', '')
                                    if f"result_{i}" in task_name or cmd.get('title') in task_name:
                                        res = event.get('event_data', {}).get('res', {})
                                        cmd_result['output'] = res.get('stdout', '')
                                        cmd_result['error'] = res.get('stderr', '')
                                        cmd_result['return_code'] = res.get('rc', 0)
                                        cmd_result['success'] = res.get('rc', 1) == 0
                                        break
                    except Exception as e:
                        logger.warning(f"Error processing command {i} for {ip}: {str(e)}")
                        cmd_result['error'] = f"Error processing result: {str(e)}"
                    
                    # Perform validation against reference value using AdvancedValidator
                    try:
                        from .advanced_validator import AdvancedValidator
                        validator = AdvancedValidator()
                        
                        # Get expected value and validation logic from command
                        expected_value = cmd.get('expected_value', cmd.get('reference_value', ''))
                        validation_logic = cmd.get('logic', cmd.get('validation_type', 'exact_match'))
                        
                        validation = validator.validate_output(
                            cmd_result.get('output', ''),
                            expected_value,
                            validation_logic
                        )
                        
                        cmd_result['is_valid'] = validation.get('is_valid', False)
                        cmd_result['validation_details'] = validation
                        cmd_result['expected_value'] = expected_value
                        cmd_result['validation_result'] = 'PASS' if validation.get('is_valid', False) else 'FAIL'
                        cmd_result['validation_type'] = validation.get('validation_type', validation_logic)
                        cmd_result['validation_method'] = validation_logic
                        cmd_result['decision'] = 'APPROVED' if validation.get('is_valid', False) else 'REJECTED'
                        
                    except Exception as e:
                        logger.warning(f"Validation error for {ip} cmd {i}: {str(e)}")
                        cmd_result['is_valid'] = False
                        cmd_result['validation_result'] = 'ERROR'
                        cmd_result['decision'] = 'REJECTED'
                    
                    server_results[ip]['commands'].append(cmd_result)
                    
                    log_content.append(f"\nCommand {i+1}: {cmd_result['title']}")
                    log_content.append(f"Command: {cmd_result['command']}")
                    log_content.append(f"Return Code: {cmd_result['return_code']}")
                    log_content.append(f"Success: {cmd_result['success']}")
                    if cmd_result['output']:
                        log_content.append(f"Output:\n{cmd_result['output']}")
                    if cmd_result['error']:
                        log_content.append(f"Error:\n{cmd_result['error']}")
                    
                    # Add Enhanced Validation Information
                    log_content.append(f"Expected value: {cmd_result.get('expected_value', '')}")
                    log_content.append(f"Validation Result: {cmd_result.get('validation_result', 'N/A')}")
                    log_content.append(f"Validation Type: {cmd_result.get('validation_type', 'N/A')}")
                    log_content.append(f"Validation Method: {cmd_result.get('validation_method', 'N/A')}")
                    log_content.append(f"Decision: {cmd_result.get('decision', 'N/A')}")
                    
                    # Add validation details if available
                    validation_details = cmd_result.get('validation_details', {})
                    if validation_details.get('score') is not None:
                        log_content.append(f"Validation Score: {validation_details.get('score', 0):.2f}")
                    
                    log_content.append("-" * 20)
                    
            else:
                server_results[ip]['status'] = 'failed'
                server_results[ip]['error'] = 'Server unreachable or connection failed'
                log_content.append(f"Status: Failed - Server unreachable")
        
        try:
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(log_content))
            logger.info(f"Log saved to: {log_path}")
        except Exception as e:
            logger.error(f"Error saving log file: {str(e)}")
        
        # Save results to database if execution_id is provided
        if execution_id:
            try:
                if assessment_type:
                    # Handle assessment case
                    from models.assessment import AssessmentResult
                    
                    assessment = AssessmentResult.query.get(execution_id)
                    if not assessment:
                        logger.error(f"Assessment with ID {execution_id} not found")
                        return server_results
                    
                    # Update assessment status based on results
                    all_success = all(s['status'] == 'success' for s in server_results.values())
                    assessment.status = 'COMPLETED' if all_success else 'FAILED'
                    
                    from models import db
                    db.session.commit()
                    logger.info(f"Assessment {execution_id} status updated to {assessment.status}")
                    
                else:
                    # Handle execution case
                    from models.execution import ServerResult, ExecutionHistory
                    from models.mop import Command as MOPCommand
                    
                    # Get execution history to find mop_id
                    execution = ExecutionHistory.query.get(execution_id)
                    if not execution:
                        logger.error(f"Execution with ID {execution_id} not found")
                        return server_results
                    
                    # Get all commands from database for this MOP
                    mop_commands = MOPCommand.query.filter_by(mop_id=execution.mop_id).all()
                    
                    for server_ip, server_result in server_results.items():
                        for i, cmd_result in enumerate(server_result['commands']):
                            # Find corresponding command in database
                            command_id = None
                            if i < len(mop_commands):
                                command_id = mop_commands[i].id
                            
                            # Create server result record
                            db_result = ServerResult(
                                execution_id=execution_id,
                                server_ip=server_ip,
                                command_id=command_id,
                                output=cmd_result.get('output', ''),
                                stderr=cmd_result.get('error', ''),
                                return_code=cmd_result.get('return_code'),
                                is_valid=cmd_result.get('is_valid', False)
                            )
                            
                            # Import db here to avoid circular imports
                            from models import db
                            db.session.add(db_result)
                    
                    db.session.commit()
                    logger.info(f"Results saved to database for execution {execution_id}")
                
            except Exception as e:
                logger.error(f"Error saving results to database: {str(e)}")
                # Don't fail the entire process if database save fails
        
        # Write per-server logs as [Server_IP]-HH-MM-SS-DD-MM-YYYY.txt
        try:
            for server_ip, result in server_results.items():
                # Format: [Server_IP]-HH-MM-SS-DD-MM-YYYY.txt
                server_log_name = f"{server_ip.replace(':', '_').replace('.', '_')}-{dir_timestamp}.txt"
                server_log_path = os.path.join(log_dir_path, server_log_name)
                lines = [f"Server: {server_ip}", "-" * 30]
                for idx, cmd_res in enumerate(result['commands']):
                    lines.append(f"Command {idx+1}: {cmd_res.get('title','')}")
                    lines.append(f"Command: {cmd_res.get('command','')}")
                    lines.append(f"Return Code: {cmd_res.get('return_code')}")
                    lines.append(f"Success: {cmd_res.get('success')}")
                    if cmd_res.get('output'):
                        lines.append(f"Output: {cmd_res.get('output')}")
                    if cmd_res.get('error'):
                        lines.append(f"Error: {cmd_res.get('error')}")
                    
                    # Add Expected value and Decision
                    expected_value = cmd_res.get('expected', '')
                    lines.append(f"Expected value: {expected_value}")
                    
                    # Decision: OK if output matches exactly with expected value, Not OK otherwise
                    actual_output = cmd_res.get('output', '').strip()
                    expected_output = expected_value.strip()
                    decision = "OK" if actual_output == expected_output else "Not OK"
                    lines.append(f"Decision: {decision}")
                    
                    lines.append("-" * 20)
                with open(server_log_path, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(lines))
        except Exception as e:
            logger.warning(f"Failed to write per-server logs: {str(e)}")

        # Convert log_content from list to string before saving
        log_content_str = '\n'.join(log_content) if isinstance(log_content, list) else log_content
        
        self.job_logs[job_id] = {
            'log_file': log_path,
            'log_content': log_content_str
        }
        
        # Get return code safely
        return_code = getattr(result, 'rc', -1) if result else -1
        
        summary = {
            'total_servers': len(servers),
            'successful_servers': sum(1 for s in server_results.values() if s['status'] == 'success'),
            'failed_servers': sum(1 for s in server_results.values() if s['status'] == 'failed'),
            'total_commands': len(commands),
            'return_code': return_code
        }
        
        return {
            'job_id': job_id,
            'timestamp': timestamp,
            'summary': summary,
            'servers': server_results,
            'log_file': log_path,
            'execution_logs': log_content
        }
    
    def run_playbook_sync(self, commands: List[Dict], servers: List[Dict], timestamp: str, assessment_type: str = "Risk") -> Optional[Dict]:
        """Synchronous helper used by scheduler; returns results dict or None."""
        job_id = f"sync_{timestamp}"
        self.run_playbook(job_id, commands, servers, timestamp, assessment_type=assessment_type)
        return self.job_results.get(job_id)

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        """Get status of a job"""
        if job_id in self.running_jobs:
            return self.running_jobs[job_id]
        return None
    
    def get_job_results(self, job_id: str) -> Optional[Dict]:
        """Get results of a job"""
        if job_id in self.job_results:
            return self.job_results[job_id]
        return None
    
    def get_job_logs(self, job_id: str) -> Optional[Dict]:
        """Get logs of a job"""
        if job_id in self.job_logs:
            return self.job_logs[job_id]
        return None
    
    def list_jobs(self) -> List[Dict]:
        """List all jobs"""
        jobs = []
        for job_id, status in self.running_jobs.items():
            job_info = {
                'job_id': job_id,
                'status': status['status'],
                'start_time': status['start_time'],
                'end_time': status.get('end_time'),
                'commands_count': status['commands_count'],
                'servers_count': status['servers_count']
            }
            if 'error' in status:
                job_info['error'] = status['error']
            jobs.append(job_info)
        return jobs