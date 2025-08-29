from ansible_runner import run
import json
import os
import tempfile
import yaml
import re
from datetime import datetime, timezone, timedelta
import logging
from typing import Dict, List, Any, Optional
from .variable_expander import VariableExpander

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
        self.job_progress = {}
        self.variable_expander = VariableExpander()
    
    def _safe_yaml_string(self, command: str) -> str:
        """
        Safely format command string for YAML to prevent parsing errors
        For shell module, we need minimal quoting to preserve shell operators
        """
        if not command:
            return ""
        
        # For shell commands, we should avoid complex quoting that breaks shell parsing
        # Just return the command as-is for shell module, YAML will handle basic escaping
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
            task_name = cmd.get('title', f"{i+1}. Check {cmd.get('command', 'command')[:50]}...")
            task = {
                "name": task_name,
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
            
            # Expand template variables in commands
            expanded_commands = self._expand_command_variables(commands, servers)
            
            self.running_jobs[job_id] = {
                'status': 'running',
                'start_time': datetime.now(GMT_PLUS_7).isoformat(),
                'commands_count': len(expanded_commands),
                'servers_count': len(servers),
                'progress': 0
            }
            
            # Initialize progress tracking
            self.job_progress[job_id] = {
                'current_command': 1,  # Start from 1 instead of 0
                'total_commands': len(expanded_commands),
                'current_server': 1,   # Start from 1 instead of 0
                'total_servers': len(servers),
                'percentage': 5        # Start with 5% to show initial progress
            }
            logger.info(f"Initialized job progress for {job_id}: {self.job_progress[job_id]}")
            
            temp_dir = self.create_dynamic_playbook(expanded_commands, servers)
            
            # Run with event handler for real-time progress
            import threading
            import time
            
            def monitor_progress():
                start_time = time.time()
                total_tasks = len(commands) * len(servers)
                completed_tasks = 0
                last_event_count = 0
                current_command = 1
                current_server = 1
                last_progress_update = 0
                
                while job_id in self.running_jobs and self.running_jobs[job_id]['status'] == 'running':
                    try:
                        # Check multiple possible event directories including UUID subdirectories
                        possible_event_dirs = [
                            os.path.join(temp_dir, 'artifacts', 'job_events'),
                            os.path.join(temp_dir, 'artifacts'),
                            os.path.join(temp_dir, 'job_events'),
                            temp_dir
                        ]
                        
                        # Also check UUID subdirectories in artifacts
                        artifacts_dir = os.path.join(temp_dir, 'artifacts')
                        if os.path.exists(artifacts_dir):
                            try:
                                for item in os.listdir(artifacts_dir):
                                    uuid_dir = os.path.join(artifacts_dir, item)
                                    if os.path.isdir(uuid_dir):
                                        # Check for job_events in UUID directory
                                        possible_event_dirs.extend([
                                            os.path.join(uuid_dir, 'job_events'),
                                            uuid_dir
                                        ])
                            except Exception as e:
                                logger.debug(f"Error scanning artifacts subdirectories: {e}")
                        
                        events_found = False
                        events_dir = None
                        
                        for possible_dir in possible_event_dirs:
                            if os.path.exists(possible_dir):
                                # Check if this directory contains event files
                                try:
                                    files = os.listdir(possible_dir)
                                    json_files = [f for f in files if f.endswith('.json')]
                                    if json_files:
                                        events_dir = possible_dir
                                        events_found = True
                                        logger.info(f"Found event files in: {events_dir} ({len(json_files)} files)")
                                        break
                                except Exception as e:
                                    logger.debug(f"Error checking directory {possible_dir}: {e}")
                                    continue
                        
                        if events_found and events_dir:
                            # Get all event files and sort by creation time for chronological order
                            event_files = []
                            for f in os.listdir(events_dir):
                                if f.endswith('.json'):
                                    file_path = os.path.join(events_dir, f)
                                    event_files.append((file_path, os.path.getctime(file_path)))
                            
                            # Sort by creation time
                            event_files.sort(key=lambda x: x[1])
                            
                            # Process new events since last check
                            if len(event_files) > last_event_count:
                                new_events = event_files[last_event_count:]
                                logger.info(f"Processing {len(new_events)} new event files")
                                
                                for event_file_path, _ in new_events:
                                    try:
                                        with open(event_file_path, 'r') as f:
                                            event_data = json.loads(f.read())
                                            event_type = event_data.get('event', '')
                                            
                                            # Track task start events for real-time progress
                                            if event_type == 'runner_on_start':
                                                task_name = event_data.get('event_data', {}).get('task', '')
                                                host = event_data.get('event_data', {}).get('host', '')
                                                
                                                logger.info(f"Task started: '{task_name}' on host '{host}'")
                                                
                                                # Extract command number from task name - look for patterns like "1. Check", "Command 1", etc.
                                                import re
                                                task_index = None
                                                
                                                # Try different patterns to extract task number
                                                patterns = [
                                                    r'^(\d+)\.',  # "1. Check something"
                                                    r'Command (\d+)',  # "Command 1"
                                                    r'result_(\d+)',  # "result_1"
                                                    r'(\d+)'  # Any number
                                                ]
                                                
                                                for pattern in patterns:
                                                    match = re.search(pattern, task_name)
                                                    if match:
                                                        task_index = int(match.group(1))
                                                        break
                                                
                                                if task_index is not None and task_index <= len(commands):
                                                    # Find server index
                                                    server_index = 1
                                                    for i, server in enumerate(servers):
                                                        if server['ip'] == host:
                                                            server_index = i + 1
                                                            break
                                                    
                                                    # Update current command and server only if valid
                                                    if task_index > current_command or (task_index == current_command and server_index > current_server):
                                                        current_command = task_index
                                                        current_server = server_index
                                                        
                                                        # Calculate progress based on total tasks completed
                                                        completed_tasks = ((current_command - 1) * len(servers)) + (current_server - 1)
                                                        progress_percentage = min(95, int((completed_tasks / total_tasks) * 100))
                                                        
                                                        # Only update if progress actually increased
                                                        if progress_percentage > last_progress_update:
                                                            last_progress_update = progress_percentage
                                                            
                                                            logger.info(f"Real-time Task Start: '{task_name}' -> Command {current_command}/{len(commands)}, Server {current_server}/{len(servers)}, Progress: {progress_percentage}%")
                                                            
                                                            # Update progress immediately
                                                            if job_id in self.running_jobs:
                                                                self.running_jobs[job_id]['progress'] = progress_percentage
                                                                
                                                            if job_id in self.job_progress:
                                                                self.job_progress[job_id].update({
                                                                    'percentage': progress_percentage,
                                                                    'current_command': current_command,
                                                                    'current_server': current_server
                                                                })
                                                else:
                                                    logger.debug(f"Could not extract valid task index from task name: '{task_name}' (extracted: {task_index})")
                                            
                                            # Also track completion events
                                            elif event_type in ['runner_on_ok', 'runner_on_failed']:
                                                task_name = event_data.get('event_data', {}).get('task', '')
                                                logger.info(f"Task completed: '{task_name}' with status '{event_type}'")
                                                if 'Command' in task_name or 'result_' in task_name or any(str(i) in task_name for i in range(1, len(commands)+1)):
                                                    completed_tasks += 1
                                                    
                                    except Exception as e:
                                        logger.debug(f"Error parsing event file {event_file_path}: {e}")
                                        continue
                                
                                last_event_count = len(event_files)
                        else:
                            # No events directory found, use improved time-based simulation
                            elapsed_time = time.time() - start_time
                            
                            # More accurate time-based simulation considering both commands and servers
                            estimated_time_per_task = 2.0  # seconds per task (command * server)
                            estimated_completed_tasks = min(total_tasks, int(elapsed_time / estimated_time_per_task))
                            
                            # Calculate estimated current command and server
                            if estimated_completed_tasks > ((current_command - 1) * len(servers) + (current_server - 1)):
                                estimated_current_command = (estimated_completed_tasks // len(servers)) + 1
                                estimated_current_server = (estimated_completed_tasks % len(servers)) + 1
                                
                                # Only update if it's a valid progression
                                if estimated_current_command <= len(commands):
                                    current_command = estimated_current_command
                                    current_server = estimated_current_server
                                    
                                    progress_percentage = min(95, int((estimated_completed_tasks / total_tasks) * 100))
                                    
                                    # Only update if progress actually increased
                                    if progress_percentage > last_progress_update:
                                        last_progress_update = progress_percentage
                                        
                                        logger.info(f"Time-based progress simulation: Command {current_command}/{len(commands)}, Server {current_server}/{len(servers)}, Progress: {progress_percentage}% (elapsed: {elapsed_time:.1f}s)")
                                        
                                        # Update progress
                                        if job_id in self.running_jobs:
                                            self.running_jobs[job_id]['progress'] = progress_percentage
                                            
                                        if job_id in self.job_progress:
                                            self.job_progress[job_id].update({
                                                'percentage': progress_percentage,
                                                'current_command': current_command,
                                                'current_server': current_server
                                            })
                            
                            # Debug logging every 5 seconds with more details
                            if int(elapsed_time) % 5 == 0 and elapsed_time > 2:
                                logger.info(f"No event files found after {elapsed_time:.1f}s. Using time-based simulation. Checked directories: {len(possible_event_dirs)}")
                                # Log which directories were checked
                                for i, dir_path in enumerate(possible_event_dirs[:5]):  # Log first 5 directories
                                    exists = "EXISTS" if os.path.exists(dir_path) else "NOT FOUND"
                                    logger.debug(f"  {i+1}. {dir_path} - {exists}")
                    
                    except Exception as e:
                        logger.error(f"Progress monitoring error for job {job_id}: {e}")
                    
                    time.sleep(0.5)  # Check every 0.5 seconds for real-time updates
                
                logger.info(f"Real-time progress monitoring ended for job {job_id}")
            
            # Start progress monitoring thread
            progress_thread = threading.Thread(target=monitor_progress, daemon=True)
            progress_thread.start()
            
            result = run(
                playbook=os.path.join(temp_dir, "dynamic_commands.yml"),
                inventory=os.path.join(temp_dir, "inventory.yml"),
                private_data_dir=temp_dir,
                forks=50,
                quiet=False
            )
            
            # Always process results to generate logs, even if there are errors
            results = self._process_results(result, commands, servers, job_id, timestamp, execution_id, assessment_type)
            
            # Get return code safely
            return_code = getattr(result, 'rc', -1) if result else -1
            
            # Update progress to 100% on completion
            if job_id in self.job_progress:
                self.job_progress[job_id]['percentage'] = 100
                self.job_progress[job_id]['current_command'] = len(commands)
            
            self.running_jobs[job_id].update({
                'status': 'completed',
                'end_time': datetime.now(GMT_PLUS_7).isoformat(),
                'success': return_code == 0,
                'progress': 100
            })
            
            # Update final progress
            if job_id in self.job_progress:
                self.job_progress[job_id].update({
                    'current_command': len(commands),
                    'current_server': len(servers),
                    'percentage': 100
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
                
                # Update progress for failed job
                if job_id in self.job_progress:
                    self.job_progress[job_id].update({
                        'percentage': 0
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
        log_content.append("")
        log_content.append("=== EXECUTION PROGRESS ===")
        
        # Store initial logs for real-time access
        self.job_logs[job_id] = {
            'log_content': '\n'.join(log_content),
            'last_updated': datetime.now(GMT_PLUS_7).isoformat()
        }
        
        # Update progress and logs during processing
        total_operations = len(commands) * len(servers)
        current_operation = 0
        
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
                    
                    # Update progress and logs in real-time
                    current_operation += 1
                    progress_percentage = min(100, int((current_operation / total_operations) * 100))
                    
                    # Calculate current server index (0-based to 1-based)
                    server_index = servers.index(next(s for s in servers if s['ip'] == ip)) + 1
                    
                    # Only update progress if it's higher than current progress to avoid conflicts with monitor_progress
                    current_progress = self.job_progress.get(job_id, {}).get('percentage', 0)
                    if progress_percentage > current_progress:
                        # Update progress tracking with correct command and server numbers
                        if job_id in self.job_progress:
                            self.job_progress[job_id]['current_command'] = i + 1  # Current command being processed (1-based)
                            self.job_progress[job_id]['current_server'] = server_index  # Current server being processed (1-based)
                            self.job_progress[job_id]['percentage'] = progress_percentage
                            logger.info(f"Processing results - Command: {i + 1}/{len(commands)}, Server: {server_index}/{len(servers)}, Progress: {progress_percentage}%")
                        
                        # Update running job progress
                        if job_id in self.running_jobs:
                            self.running_jobs[job_id]['progress'] = progress_percentage
                    
                    # Perform validation against reference value using AdvancedValidator
                    try:
                        from .advanced_validator import AdvancedValidator
                        validator = AdvancedValidator()
                        
                        # Check if this is 6-column format (has extract_method and comparator_method)
                        if cmd.get('extract_method') and cmd.get('comparator_method'):
                            # New 6-column format validation
                            expected_value = cmd.get('reference_value', '')
                            validation_options = {
                                'extract_method': cmd.get('extract_method'),
                                'comparator_method': cmd.get('comparator_method')
                            }
                            
                            validation = validator.validate_output(
                                cmd_result.get('output', ''),
                                expected_value,
                                'extract_compare',
                                validation_options
                            )
                            
                            # Use formatted_result from validation details for display
                            formatted_result = validation.get('details', {}).get('formatted_result', 'Not OK')
                            cmd_result['validation_result'] = formatted_result
                            
                        else:
                            # Legacy 3-column format validation
                            expected_value = cmd.get('expected_value', cmd.get('reference_value', ''))
                            validation_logic = cmd.get('logic', cmd.get('validation_type', 'exact_match'))
                            
                            validation = validator.validate_output(
                                cmd_result.get('output', ''),
                                expected_value,
                                validation_logic
                            )
                            
                            # Convert legacy PASS/FAIL to OK/Not OK format
                            is_valid = validation.get('is_valid', False)
                            cmd_result['validation_result'] = 'OK' if is_valid else 'Not OK'
                        
                        cmd_result['is_valid'] = validation.get('is_valid', False)
                        cmd_result['validation_details'] = validation
                        cmd_result['expected_value'] = expected_value
                        cmd_result['validation_type'] = validation.get('validation_type', validation_logic if 'validation_logic' in locals() else 'extract_compare')
                        cmd_result['validation_method'] = cmd.get('extract_method', validation_logic if 'validation_logic' in locals() else 'unknown')
                        cmd_result['decision'] = 'APPROVED' if validation.get('is_valid', False) else 'REJECTED'
                        
                        # Add 6-column specific fields
                        if cmd.get('extract_method'):
                            cmd_result['extract_method'] = cmd.get('extract_method')
                            cmd_result['comparator_method'] = cmd.get('comparator_method')
                            cmd_result['command_id_ref'] = cmd.get('command_id_ref', '')
                        
                    except Exception as e:
                        logger.warning(f"Validation error for {ip} cmd {i}: {str(e)}")
                        cmd_result['is_valid'] = False
                        cmd_result['validation_result'] = 'Not OK'
                        cmd_result['decision'] = 'REJECTED'
                    
                    server_results[ip]['commands'].append(cmd_result)
                    
                    log_content.append(f"\nCommand {i+1}: {cmd_result['title']}")
                    log_content.append(f"Command: {cmd_result['command']}")
                    log_content.append(f"Expected value: {cmd_result.get('expected_value', '')}")
                    
                    # Add Result field - the direct output from command execution
                    result_output = cmd_result.get('output', '').strip()
                    log_content.append(f"Result: {result_output}")
                    
                    # Convert decision from APPROVED/REJECTED to OK/Not OK
                    decision = cmd_result.get('decision', 'N/A')
                    if decision == 'APPROVED':
                        decision_display = 'OK'
                    elif decision == 'REJECTED':
                        decision_display = 'Not OK'
                    else:
                        decision_display = 'Not OK'
                    
                    log_content.append(f"Decision: {decision_display}")
                    log_content.append("-" * 20)
                    
                    # Update logs in real-time
                    if job_id in self.job_logs:
                        self.job_logs[job_id]['log_content'] = '\n'.join(log_content)
                        self.job_logs[job_id]['last_updated'] = datetime.now(GMT_PLUS_7).isoformat()
                    
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
                    assessment.status = 'success' if all_success else 'fail'
                    
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
                    
                    # Add Expected value
                    expected_value = cmd_res.get('expected', '')
                    lines.append(f"Expected value: {expected_value}")
                    
                    # Add Result field - the direct output from command execution
                    result_output = cmd_res.get('output', '').strip()
                    lines.append(f"Result: {result_output}")
                    
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
        
        # Final update to logs
        self.job_logs[job_id] = {
            'log_file': log_path,
            'log_content': log_content_str,
            'last_updated': datetime.now(GMT_PLUS_7).isoformat(),
            'status': 'completed'
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
        
        # Expand variables in commands before execution
        expanded_commands = self._expand_command_variables(commands, servers)
        
        self.run_playbook(job_id, expanded_commands, servers, timestamp, assessment_type=assessment_type)
        return self.job_results.get(job_id)

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        """Get status of a job with detailed progress"""
        if job_id in self.running_jobs:
            status = self.running_jobs[job_id].copy()
            
            # Add detailed progress information
            if job_id in self.job_progress:
                progress_info = self.job_progress[job_id]
                status.update({
                    'detailed_progress': {
                        'current_command': progress_info.get('current_command', 0),
                        'total_commands': progress_info.get('total_commands', 0),
                        'current_server': progress_info.get('current_server', 0),
                        'total_servers': progress_info.get('total_servers', 0),
                        'percentage': progress_info.get('percentage', 0)
                    }
                })
            
            return status
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
    
    def _expand_command_variables(self, commands: List[Dict], servers: List[Dict]) -> List[Dict]:
        """Expand template variables in commands using VariableExpander"""
        try:
            expanded_commands = []
            for cmd in commands:
                expanded_cmd = cmd.copy()
                
                # Expand variables in command field
                if 'command' in expanded_cmd:
                    expanded_cmd['command'] = self.variable_expander.expand_variables(
                        expanded_cmd['command'], servers
                    )
                
                # Expand variables in reference_value field for 6-column format
                if 'reference_value' in expanded_cmd:
                    expanded_cmd['reference_value'] = self.variable_expander.expand_variables(
                        expanded_cmd['reference_value'], servers
                    )
                
                # Expand variables in expected_value field for legacy format
                if 'expected_value' in expanded_cmd:
                    expanded_cmd['expected_value'] = self.variable_expander.expand_variables(
                        expanded_cmd['expected_value'], servers
                    )
                
                expanded_commands.append(expanded_cmd)
            
            logger.info(f"Expanded template variables in {len(commands)} commands")
            return expanded_commands
            
        except Exception as e:
            logger.warning(f"Error expanding template variables: {str(e)}")
            return commands  # Return original commands if expansion fails