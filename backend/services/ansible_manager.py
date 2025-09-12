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
from .recommendation_engine import RecommendationEngine

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
        self.recommendation_engine = RecommendationEngine()
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
        def _sanitize_id(raw_id: str) -> str:
            try:
                # Keep alnum and underscore only for ansible var safety
                return re.sub(r"[^A-Za-z0-9_]", "_", str(raw_id))
            except Exception:
                return str(raw_id)

        for i, cmd in enumerate(commands):
            safe_command = self._safe_yaml_string(cmd['command'])
            # Use standardized task name format for easier parsing
            # Prefer stable display index if provided (for expanded tasks)
            display_idx = cmd.get('_display_index') or (i + 1)
            task_name = cmd.get('title', f"Command {display_idx}: {cmd.get('command', 'command')[:50]}...")
            if not task_name.startswith(f"{display_idx}") and not task_name.startswith(f"Command {display_idx}"):
                task_name = f"{display_idx}. {task_name}"
            # Prefer stable register name by command id if available
            stable_id = (cmd.get('command_id_ref') or cmd.get('command_id') or cmd.get('id') or None)
            register_name = f"result_{i}"
            if stable_id is not None:
                register_name = f"result_id_{_sanitize_id(stable_id)}"
            task = {
                "name": task_name,
                "shell": safe_command,
                "register": register_name,
                "ignore_errors": True
            }
            # Add ansible when condition if provided by pre-processing
            when_condition = cmd.get('when')
            if when_condition:
                task["when"] = when_condition
            tasks.append(task)
        
        playbook_content = [{
            "name": "Checklist",
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
        """
        Main entry point - unified execution with smart analysis
        """
        logger.info(f"Starting job {job_id} with {len(commands)} commands on {len(servers)} servers")
        
        try:
            # Initialize job tracking (commands will be expanded later)
            self._initialize_job_tracking(job_id, commands, servers)
            
            # Luôn sử dụng smart execution để đảm bảo xử lý skip/biến đúng
            logger.info(f"Using smart execution for job {job_id} (forced unified path)")
            return self._execute_with_smart_analysis(job_id, commands, servers, timestamp, execution_id, assessment_type)
        except Exception as e:
            logger.error(f"Job {job_id} failed with error: {str(e)}")
            self._handle_job_failure(job_id, str(e))
            raise
    
    def _initialize_job_tracking(self, job_id: str, commands: List[Dict], servers: List[Dict]):
        """Initialize job tracking data (common for all execution types)"""
        # Use actual expanded commands count for tracking
        actual_commands_count = len(commands)
        
        self.running_jobs[job_id] = {
            'status': 'running',
            'start_time': datetime.now(GMT_PLUS_7).isoformat(),
            'commands_count': actual_commands_count,  # Use actual expanded count
            'servers_count': len(servers),
            'progress': 5  # Start with 5% to show initial progress
        }
        
        # Initialize progress tracking
        self.job_progress[job_id] = {
            'current_command': 1,
            'total_commands': actual_commands_count,  # Use actual expanded count
            'current_server': 1,
            'total_servers': len(servers),
            'percentage': 5
        }
        logger.info(f"Initialized job tracking for {job_id}: {actual_commands_count} commands, {len(servers)} servers")
    
    def _handle_job_failure(self, job_id: str, error_message: str):
        """Handle job failure (common for all execution types)"""
        if job_id in self.running_jobs:
            self.running_jobs[job_id].update({
                'status': 'failed',
                'end_time': datetime.now(GMT_PLUS_7).isoformat(),
                'error': error_message
            })
        
        if job_id in self.job_progress:
            self.job_progress[job_id].update({
                'percentage': 0
            })
    
    def _execute_with_smart_analysis(self, job_id: str, commands: List[Dict], servers: List[Dict], timestamp: str, execution_id: int = None, assessment_type: str = None):
        """
        Sequential smart execution with inline skip/variable handling
        """
        logger.info(f"=== SMART EXECUTION (SINGLE PLAYBOOK) STARTED ===")
        logger.info(f"Job ID: {job_id}")
        logger.info(f"Commands: {len(commands)}")
        logger.info(f"Servers: {len(servers)}")
        
        # Store original commands count for UI display
        original_commands_count = len(commands)
        
        # Step 1: expand variables (so we have final task list)
        expanded_commands = self._expand_command_variables(commands, servers)
        logger.info(f"Expanded template variables: {len(commands)} -> {len(expanded_commands)} commands (preprocess for when)")
        
        # Update job tracking with actual expanded commands count
        if job_id in self.job_progress:
            self.job_progress[job_id]['total_commands'] = len(expanded_commands)
        if job_id in self.running_jobs:
            self.running_jobs[job_id]['commands_count'] = len(expanded_commands)
        logger.info(f"Updated job tracking for {job_id}: {len(expanded_commands)} expanded commands")
        
        # Step 2: annotate display index so tasks keep original numbering for progress/mapping
        annotated_commands = self._annotate_display_index(commands, expanded_commands)
        
        # Step 3: convert skip markers to 'when' conditions AFTER expand, using stable result_id_<id>
        preprocessed_commands = self._preprocess_commands_for_single_playbook(annotated_commands)
        logger.info(f"Preprocessed commands for single playbook: {len(preprocessed_commands)} tasks")

        return self._execute_standard_playbook(job_id, preprocessed_commands, servers, timestamp, execution_id, assessment_type, original_commands_count)
    
    
    def _execute_standard_playbook(self, job_id: str, commands: List[Dict], servers: List[Dict], timestamp: str, execution_id: int = None, assessment_type: str = None, original_commands_count: int = None):
        """Run playbook with detailed monitoring and progress tracking"""
        try:
            logger.info(f"=== STANDARD EXECUTION WITH MONITORING ===")
            logger.info(f"Job ID: {job_id}")
            logger.info(f"Commands: {len(commands)}")
            logger.info(f"Servers: {len(servers)}")
            if original_commands_count:
                logger.info(f"Original commands count for UI: {original_commands_count}")
            
            # Use commands as final list (caller handles expansion if needed)
            final_commands = commands
            
            temp_dir = self.create_dynamic_playbook(final_commands, servers)
            
            # Run with event handler for real-time progress
            import threading
            import time
            
            def monitor_progress():
                start_time = time.time()
                # Total physical tasks for progress percent
                total_tasks = len(final_commands) * len(servers)
                # Use expanded commands count for display (no more original count)
                total_expanded_commands = len(final_commands)
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
                                        #logger.info(f"Found event files in: {events_dir} ({len(json_files)} files)")
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
                                #logger.info(f"Processing {len(new_events)} new event files")
                                
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
                                                
                                                # Track task progress using event counter instead of task name extraction
                                                # Count actual tasks started for more accurate progress tracking
                                                
                                                # Track command progress across all servers
                                                # Use task name to identify which command is being executed
                                                task_name = event_data.get('event_data', {}).get('task', '')
                                                
                                                # Extract display command number from task name (format: "<display_idx>. Command title")
                                                task_index = 1
                                                if task_name and '.' in task_name:
                                                    try:
                                                        task_index = int(task_name.split('.')[0])
                                                    except (ValueError, IndexError):
                                                        task_index = 1
                                                
                                                # Ensure we don't exceed total base commands
                                                task_index = min(task_index, total_expanded_commands)
                                                
                                                # Find server index
                                                server_index = 1
                                                for i, server in enumerate(servers):
                                                    if server['ip'] == host:
                                                        server_index = i + 1
                                                        break
                                                
                                                # Calculate progress based on actual task execution
                                                current_command = task_index
                                                current_server = server_index
                                                
                                                # Calculate completed tasks (tasks started + current task progress)
                                                completed_tasks = ((current_command - 1) * len(servers)) + server_index
                                                progress_percentage = min(95, int((completed_tasks / total_tasks) * 100))
                                                
                                                # Always update progress for real-time tracking
                                                if progress_percentage >= last_progress_update:
                                                    last_progress_update = progress_percentage
                                                    logger.info(f"Progress updated: task {current_command}/{total_expanded_commands}, server {current_server}/{len(servers)}, percentage: {progress_percentage}%")
                                                    
                                                    logger.info(f"Real-time Task Start: '{task_name}' -> Command {current_command}/{total_expanded_commands}, Server {current_server}/{len(servers)}, Progress: {progress_percentage}% (Task position: {completed_tasks}/{total_tasks})")
                                                    
                                                    # Update progress immediately
                                                    if job_id in self.running_jobs:
                                                        self.running_jobs[job_id]['progress'] = progress_percentage
                                                        
                                                    if job_id in self.job_progress:
                                                        self.job_progress[job_id].update({
                                                            'percentage': progress_percentage,
                                                            'current_command': current_command,
                                                            'current_server': current_server,
                                                            'total_commands': total_expanded_commands
                                                        })
                                            
                                            # Also track completion events for more accurate progress
                                            elif event_type in ['runner_on_ok', 'runner_on_failed']:
                                                task_name = event_data.get('event_data', {}).get('task', '')
                                                host = event_data.get('event_data', {}).get('host', '')
                                                logger.info(f"Task completed: '{task_name}' on host '{host}' with status '{event_type}'")
                                                
                                                # Track command progress using task name parsing
                                                task_name = event_data.get('event_data', {}).get('task', '')
                                                
                                                # Extract display command number from task name (format: "<display_idx>. Command title")
                                                task_index = 1
                                                if task_name and '.' in task_name:
                                                    try:
                                                        task_index = int(task_name.split('.')[0])
                                                    except (ValueError, IndexError):
                                                        task_index = 1
                                                
                                                # Ensure we don't exceed total base commands
                                                task_index = min(task_index, total_expanded_commands)
                                                
                                                # Find server index
                                                server_index = 1
                                                for i, server in enumerate(servers):
                                                    if server['ip'] == host:
                                                        server_index = i + 1
                                                        break
                                                
                                                # Calculate progress based on actual task completion
                                                current_command = task_index
                                                current_server = server_index
                                                
                                                completed_tasks = ((current_command - 1) * len(servers)) + server_index
                                                progress_percentage = min(95, int((completed_tasks / total_tasks) * 100))
                                                    
                                                if progress_percentage > last_progress_update:
                                                    last_progress_update = progress_percentage
                                                    logger.info(f"Progress updated from completion: task {current_command}/{total_expanded_commands}, server {current_server}/{len(servers)}, percentage: {progress_percentage}%")
                                                        
                                                    # Update progress
                                                    if job_id in self.running_jobs:
                                                        self.running_jobs[job_id]['progress'] = progress_percentage
                                                            
                                                    if job_id in self.job_progress:
                                                        self.job_progress[job_id].update({
                                                            'percentage': progress_percentage,
                                                            'current_command': current_command,
                                                            'current_server': current_server,
                                                            'total_commands': total_expanded_commands
                                                        })
                                                    
                                    except Exception as e:
                                        logger.debug(f"Error parsing event file {event_file_path}: {e}")
                                        continue
                                
                                last_event_count = len(event_files)
                        else:
                            # No events directory found, use improved time-based simulation
                            elapsed_time = time.time() - start_time
                            
                            # More accurate time-based simulation considering both commands and servers
                            estimated_time_per_task = 1.5  # seconds per task (command * server) - reduced for faster updates
                            estimated_completed_tasks = min(total_tasks, int(elapsed_time / estimated_time_per_task))
                            
                            # Calculate current task position
                            current_task_position = ((current_command - 1) * len(servers)) + (current_server - 1)
                            
                            # Only update if we've estimated more tasks completed
                            if estimated_completed_tasks > current_task_position:
                                # Calculate estimated current command and server based on completed tasks
                                estimated_current_command = min(total_expanded_commands, (estimated_completed_tasks // len(servers)) + 1)
                                estimated_current_server = (estimated_completed_tasks % len(servers)) + 1
                                
                                # Ensure we don't go beyond the last server for the current command
                                if estimated_current_command == len(commands) and estimated_current_server > len(servers):
                                    estimated_current_server = len(servers)
                                
                                current_command = estimated_current_command
                                current_server = estimated_current_server
                                
                                progress_percentage = min(95, int((estimated_completed_tasks / total_tasks) * 100))
                                
                                # Always update for time-based simulation
                                if progress_percentage >= last_progress_update:
                                    last_progress_update = progress_percentage
                                    
                                    logger.info(f"Time-based progress simulation: Command {current_command}/{total_expanded_commands}, Server {current_server}/{len(servers)}, Progress: {progress_percentage}% (elapsed: {elapsed_time:.1f}s, estimated tasks: {estimated_completed_tasks}/{total_tasks})")
                                    
                                    # Update progress
                                    if job_id in self.running_jobs:
                                        self.running_jobs[job_id]['progress'] = progress_percentage
                                        
                                    if job_id in self.job_progress:
                                        self.job_progress[job_id].update({
                                            'percentage': progress_percentage,
                                            'current_command': current_command,
                                            'current_server': current_server,
                                            'total_commands': total_expanded_commands
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
            results = self._process_results(result, final_commands, servers, job_id, timestamp, execution_id, assessment_type)
            
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
                    results = self._process_results(result, final_commands, servers, job_id, timestamp, execution_id, assessment_type)
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
                            'failed_count': len(final_commands) * len(servers),
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
            
            # Set server status based on ansible stats if available
            if hasattr(result, 'stats') and result.stats:
                if ip in result.stats.get('ok', {}):
                    server_results[ip]['status'] = 'success'
                elif ip in result.stats.get('failures', {}) or ip in result.stats.get('dark', {}):
                    server_results[ip]['status'] = 'failed'
                elif ip in result.stats.get('changed', {}):
                    server_results[ip]['status'] = 'changed'
                else:
                    server_results[ip]['status'] = 'unknown'
            else:
                # Default status when no stats available
                server_results[ip]['status'] = 'unknown'

            # Always process all commands to populate results
            for i, cmd in enumerate(commands):
                # Use command as-is (variables should already be expanded by _expand_command_variables)
                # Use the expanded title if available, otherwise fallback to original title
                expanded_title = cmd.get('title', f'Command {i+1}')
                cmd_result = {
                    'title': expanded_title,
                    'command': cmd.get('command', ''),
                    'command_text': cmd.get('command', ''),  # Add for frontend compatibility
                    'command_name': expanded_title,  # Use same expanded title for consistency
                    'command_index': i,  # Add command index for tracking
                    'display_index': cmd.get('_display_index', i + 1),
                    'output': '',
                    'error': '',
                    'return_code': None,
                    'success': False,
                    'is_valid': False,
                    'expected': cmd.get('reference_value', ''),
                    'reference_value': cmd.get('reference_value', ''),  # Add for frontend compatibility
                    'validation_type': cmd.get('validation_type', 'exact_match'),
                    'skip_condition': cmd.get('skip_condition'),
                    'skipped': False,
                    'skip_reason': '',
                    '_expanded_from': cmd.get('_expanded_from'),  # Track original command for expanded commands
                    '_expanded_variables': cmd.get('_expanded_variables'),  # Track expanded variables
                    '_expanded_index': cmd.get('_expanded_index'),  # Track expansion index
                    'command_id_ref': cmd.get('command_id_ref', cmd.get('command_id', cmd.get('id')))  # Add command ID reference
                }
                
                # Defer appending until after we attempt to bind ansible event outputs
                # Update progress
                current_operation += 1
                progress_percentage = min(100, int((current_operation / total_operations) * 100))
                server_index = servers.index(next(s for s in servers if s['ip'] == ip)) + 1
                        
                current_progress = self.job_progress.get(job_id, {}).get('percentage', 0)
                if progress_percentage > current_progress:
                    if job_id in self.job_progress:
                        self.job_progress[job_id]['current_command'] = i + 1
                        self.job_progress[job_id]['current_server'] = server_index
                        self.job_progress[job_id]['percentage'] = progress_percentage
                            
                    if job_id in self.running_jobs:
                        self.running_jobs[job_id]['progress'] = progress_percentage
                        
                # Add expanded command info to log if applicable
                expanded_info = f" (expanded from {cmd.get('_expanded_from')})" if cmd.get('_expanded_from') else ""
                command_display = f"Command {i+1}: {cmd_result['title']}{expanded_info}"
                    
                try:
                    if hasattr(result, 'events') and result.events:
                        for event in result.events:
                            event_type = event.get('event')
                            event_host = event.get('event_data', {}).get('host')
                            
                            # Check for skipped tasks first
                            if event_type == 'runner_on_skipped' and event_host == ip:
                                task_name = event.get('event_data', {}).get('task', '')
                                # Match by display index in task_name ("<display_idx>. ") or by title
                                matches_display = False
                                try:
                                    if task_name and '.' in task_name:
                                        idx_part = int(task_name.split('.')[0])
                                        matches_display = (idx_part == (cmd.get('_display_index') or (i+1)))
                                except Exception:
                                    matches_display = False
                                if matches_display or (cmd.get('title') and cmd.get('title') in task_name):
                                    # Mark as skipped
                                    cmd_result['skipped'] = True
                                    cmd_result['skip_reason'] = event.get('event_data', {}).get('res', {}).get('msg', 'Task skipped due to when condition')
                                    cmd_result['output'] = ''
                                    cmd_result['error'] = ''
                                    cmd_result['return_code'] = 0
                                    cmd_result['success'] = True
                                    cmd_result['is_valid'] = True
                                    cmd_result['validation_result'] = 'OK (skipped)'
                                    cmd_result['decision'] = 'APPROVED'
                                    logger.info(f"Task {task_name} on {ip} was skipped: {cmd_result['skip_reason']}")
                                    break
                            
                            # Check for normal execution results
                            elif event_type in ['runner_on_ok', 'runner_on_failed'] and event_host == ip:
                                task_name = event.get('event_data', {}).get('task', '')
                                # Match by display index in task_name ("<display_idx>. ") or by title
                                matches_display = False
                                try:
                                    if task_name and '.' in task_name:
                                        idx_part = int(task_name.split('.')[0])
                                        matches_display = (idx_part == (cmd.get('_display_index') or (i+1)))
                                except Exception:
                                    matches_display = False
                                if matches_display or (cmd.get('title') and cmd.get('title') in task_name):
                                    res = event.get('event_data', {}).get('res', {})
                                    cmd_result['output'] = res.get('stdout', '')
                                    cmd_result['error'] = res.get('stderr', '')
                                    cmd_result['return_code'] = res.get('rc', 0)
                                    cmd_result['success'] = res.get('rc', 1) == 0
                                    break
                except Exception as e:
                    logger.warning(f"Error processing command {i} for {ip}: {str(e)}")
                    # Ensure cmd_result exists before setting error
                    try:
                        cmd_result['error'] = f"Error processing result: {str(e)}"
                    except Exception:
                        pass
                
                # Append once after attempting to bind outputs (ok/failed)
                server_results[ip]['commands'].append(cmd_result)
                
                # Perform validation against reference value using AdvancedValidator
                try:
                    from .advanced_validator import AdvancedValidator
                    validator = AdvancedValidator()
                    
                    # Skip validation for skipped commands
                    if cmd_result.get('skipped', False):
                        logger.info(f"Skipping validation for skipped command: {cmd_result.get('title', '')}")
                        logger.info(f"Preserving skipped status for command: {cmd_result.get('title', '')}")
                    else:
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
                            # Fallback to basic validation for commands without extract/comparator methods
                            expected_value = cmd.get('reference_value', '')
                            validation_logic = 'exact_match'  # Default validation method
                            
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
                        cmd_result['validation_type'] = validation.get('validation_type', 'extract_compare' if cmd.get('extract_method') else 'exact_match')
                        cmd_result['validation_method'] = cmd.get('extract_method', 'exact_match')
                        # Don't override decision for skipped commands
                        cmd_result['decision'] = 'APPROVED' if validation.get('is_valid', False) else 'REJECTED'
                            
                        # Generate recommendations for failed commands
                        if not validation.get('is_valid', False):
                            try:
                                recommendations = self.recommendation_engine.generate_recommendations(
                                    command=cmd.get('command', ''),
                                    output=cmd_result.get('output', ''),
                                    error=cmd_result.get('error', ''),
                                    validation_result=cmd_result.get('validation_result', 'Not OK')
                                )
                                cmd_result['recommendations'] = recommendations
                            except Exception as e:
                                logger.warning(f"Failed to generate recommendations for command {i+1}: {str(e)}")
                                cmd_result['recommendations'] = []
                        
                        # Add 6-column specific fields
                        if cmd.get('extract_method'):
                            cmd_result['extract_method'] = cmd.get('extract_method')
                            cmd_result['comparator_method'] = cmd.get('comparator_method')
                            cmd_result['command_id_ref'] = cmd.get('command_id_ref', '')
                    
                except Exception as e:
                    logger.warning(f"Validation error for {ip} cmd {i}: {str(e)}")
                    try:
                        # Don't override skipped commands even on validation error
                        if not cmd_result.get('skipped', False):
                            cmd_result['is_valid'] = False
                            cmd_result['validation_result'] = 'Not OK'
                            cmd_result['decision'] = 'REJECTED'
                        else:
                            logger.info(f"Preserving skipped status despite validation error for: {cmd_result.get('title', '')}")
                    except Exception:
                        pass
                    
                    # Add expanded command info to log if applicable
                    expanded_info = f" (expanded from {cmd.get('_expanded_from')})" if cmd.get('_expanded_from') else ""
                    command_display = f"Command {i+1}: {cmd_result['title']}{expanded_info}"
                    
                    log_content.append(f"\n{command_display}")
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
                    
                    # Prepare test_results for database storage
                    # Use expanded commands count instead of original count
                    total_expanded = len(commands)  # This is already the expanded list
                    test_results = []
                    
                    # Group by server first, then by base display_index to ensure exactly total_expanded per server
                    for server_ip, server_result in server_results.items():
                        per_server_group: Dict[int, Dict[str, Any]] = {}
                        # Seed all base indices 1..total_expanded with default info from expanded commands list
                        for idx in range(1, total_expanded + 1):
                            expanded_cmd = commands[idx - 1] if idx - 1 < len(commands) else {}
                            per_server_group[idx] = {
                                'server_ip': server_ip,
                                'title': expanded_cmd.get('title', expanded_cmd.get('description', f'Command {idx}')) if isinstance(expanded_cmd, dict) else f'Command {idx}',
                                'command': expanded_cmd.get('command', expanded_cmd.get('command_text', '')) if isinstance(expanded_cmd, dict) else '',
                                'sub_results': []
                            }
                        # Fill sub-results from executed command results
                        for cmd_result in server_result.get('commands', []):
                            display_idx = int(cmd_result.get('display_index') or cmd_result.get('command_index', 0) + 1)
                            if display_idx < 1 or display_idx > total_expanded:
                                continue
                            per_server_group[display_idx]['sub_results'].append({
                                'title': cmd_result.get('title',''),
                                'command': cmd_result.get('command',''),
                                'output': (cmd_result.get('output', '') or '').strip(),
                                'expected': (cmd_result.get('expected_value', '') or '').strip(),
                                'validation_result': cmd_result.get('validation_result', 'Not OK'),
                                'decision': cmd_result.get('decision', 'REJECTED'),
                                'is_valid': cmd_result.get('is_valid', False),
                                'skipped': cmd_result.get('skipped', False),
                                'skip_reason': cmd_result.get('skip_reason', ''),
                                'extract_method': cmd_result.get('extract_method', ''),
                                'comparator_method': cmd_result.get('comparator_method', ''),
                                'command_id_ref': cmd_result.get('command_id_ref', ''),
                                'skip_condition': cmd_result.get('skip_condition_result', '')
                            })
                        # Flatten per server
                        for display_idx in range(1, total_expanded + 1):
                            base = per_server_group[display_idx]
                            sub = base['sub_results']
                            if not sub:
                                # No execution captured (e.g., fully skipped silently) → create empty sub to represent it
                                expanded_cmd = commands[display_idx-1] if display_idx-1 < len(commands) else {}
                                sub = [{
                                    'title': base['title'],
                                    'command': base['command'],
                                    'output': '',
                                    'expected': '',
                                    'validation_result': 'OK (skipped)' if 'when' in (expanded_cmd or {}) else 'Not OK',
                                    'decision': 'APPROVED' if 'when' in (expanded_cmd or {}) else 'REJECTED',
                                    'skipped': 'when' in (expanded_cmd or {}),
                                    'skip_reason': ''
                                }]
                            all_ok_or_skipped = all(s.get('validation_result') in ['OK', 'OK (skipped)'] for s in sub)
                            aggregate_validation = 'OK' if all_ok_or_skipped else 'Not OK'
                            aggregate_decision = 'APPROVED' if all_ok_or_skipped else 'REJECTED'
                            joined_output = '\n---\n'.join([s.get('output','') for s in sub])
                            joined_expected = '\n---\n'.join([s.get('expected','') for s in sub])
                            test_results.append({
                                'server_ip': base['server_ip'],
                                'command': base['command'],
                                'command_text': base['command'],
                                'output': joined_output,
                                'expected': joined_expected,
                                'reference_value': joined_expected,
                                'expected_output': joined_expected,
                                'validation_result': aggregate_validation,
                                'decision': aggregate_decision,
                                'is_valid': all_ok_or_skipped,
                                'skipped': all(s.get('skipped', False) for s in sub),
                                'skip_reason': '; '.join([s.get('skip_reason','') for s in sub if s.get('skip_reason')]),
                                'title': base['title'],
                                'extract_method': '',
                                'comparator_method': '',
                                'command_id_ref': sub[0].get('command_id_ref', '') if sub else '',
                                'command_index': (display_idx - 1),
                                'skip_condition': '',
                                'sub_results': sub
                            })
                    
                    # Update assessment status and test_results
                    all_success = all(s['status'] == 'success' for s in server_results.values())
                    assessment.status = 'success' if all_success else 'fail'
                    assessment.test_results = test_results
                    assessment.completed_at = datetime.now(GMT_PLUS_7)
                    
                    from models import db
                    db.session.commit()
                    logger.info(f"Assessment {execution_id} status updated to {assessment.status} with {len(test_results)} test results")
                    
                else:
                    # Handle execution case
                    from models.execution import ServerResult, ExecutionHistory
                    from models.mop import Command as MOPCommand
                    
                    # Get execution history to find mop_id
                    execution = ExecutionHistory.query.get(execution_id)
                    if not execution:
                        logger.error(f"Execution with ID {execution_id} not found")
                        return server_results
                    
                    # Calculate skipped commands count
                    skipped_count = 0
                    for server_result in server_results.values():
                        for cmd_result in server_result.get('commands', []):
                            if cmd_result.get('skipped', False):
                                skipped_count += 1
                    
                    # Update execution with skipped commands count
                    execution.skipped_commands = skipped_count
                    
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
                                is_valid=cmd_result.get('is_valid', False),
                                skipped=cmd_result.get('skipped', False),
                                skip_reason=cmd_result.get('skip_reason', ''),
                                skip_condition_result=cmd_result.get('skip_condition_result', '')
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
                    
                    # Decision: Use validation_result from AdvancedValidator
                    decision = cmd_res.get('validation_result', 'Not OK')
                    lines.append(f"Decision: {decision}")
                    
                    lines.append("-" * 20)
                with open(server_log_path, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(lines))
        except Exception as e:
            logger.warning(f"Failed to write per-server logs: {str(e)}")

        # Convert log_content from list to string before saving
        log_content_str = '\n'.join(log_content) if isinstance(log_content, list) else log_content
        
        # Write complete log content to file including assessment summary
        try:
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write(log_content_str)
            logger.info(f"Assessment log with summary written to {log_path}")
        except Exception as e:
            logger.error(f"Failed to write assessment log: {str(e)}")
        
        # Final update to logs
        self.job_logs[job_id] = {
            'log_file': log_path,
            'log_content': log_content_str,
            'last_updated': datetime.now(GMT_PLUS_7).isoformat(),
            'status': 'completed'
        }
        
        # Get return code safely
        return_code = getattr(result, 'rc', -1) if result else -1
        
        # Calculate detailed assessment metrics
        total_tasks = 0
        ok_tasks = 0
        not_ok_tasks = 0
        skipped_tasks = 0
        
        for server_result in server_results.values():
            for cmd_result in server_result.get('commands', []):
                total_tasks += 1
                validation_result = cmd_result.get('validation_result', 'Not OK')
                
                if cmd_result.get('skipped', False) or validation_result == 'OK (skipped)':
                    skipped_tasks += 1
                elif validation_result == 'OK':
                    ok_tasks += 1
                else:
                    not_ok_tasks += 1
        
        # Calculate execution time
        end_time = datetime.now(GMT_PLUS_7)
        start_time_str = timestamp  # This is the start timestamp
        try:
            start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=GMT_PLUS_7)
            execution_duration = (end_time - start_time).total_seconds()
        except:
            execution_duration = 0
        
        # Create comprehensive assessment summary
        assessment_summary = {
            'assessment_type': assessment_type,
            'start_time': start_time_str,
            'end_time': end_time.isoformat(),
            'execution_duration_seconds': execution_duration,
            'total_servers': len(servers),
            'successful_servers': sum(1 for s in server_results.values() if s['status'] == 'success'),
            'failed_servers': sum(1 for s in server_results.values() if s['status'] == 'failed'),
            'total_tasks': total_tasks,
            'ok_tasks': ok_tasks,
            'not_ok_tasks': not_ok_tasks,
            'skipped_tasks': skipped_tasks,
            'total_commands': len(commands),
            'servers_assessed': [{'ip': s['ip'], 'username': s['admin_username']} for s in servers],
            'return_code': return_code
        }
        
        # Add assessment summary to log content
        log_content.append("\n=== ASSESSMENT SUMMARY ===")
        log_content.append(f"Assessment Type: {assessment_type}")
        log_content.append(f"Start Time: {start_time_str}")
        log_content.append(f"End Time: {end_time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        log_content.append(f"Execution Duration: {execution_duration:.2f} seconds")
        log_content.append(f"Total Servers: {len(servers)}")
        log_content.append(f"Total Tasks: {total_tasks}")
        log_content.append(f"OK Tasks: {ok_tasks}")
        log_content.append(f"Not OK Tasks: {not_ok_tasks}")
        log_content.append(f"Skipped Tasks: {skipped_tasks}")
        log_content.append("\nServers Assessed:")
        for server in servers:
            log_content.append(f"  - {server['ip']} (user: {server['admin_username']})")
        log_content.append("=" * 50)
        
        summary = assessment_summary
        
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
        """Expand template variables in commands using VariableExpander.
        - Hỗ trợ biến trong cả 'command', 'reference_value', 'expected_value' và 'title'
        - Nếu biến là list (đa giá trị), nhân bản task tương ứng
        """
        try:
            # Build simple context without remote discovery to avoid SSH issues
            server_context = {
                'user': ['root', 'admin', 'oracle', 'postgres'],  # Common users
                'users': ['root', 'admin', 'oracle', 'postgres'],
                'bond': ['bond0', 'bond1'],  # Common bond interfaces
                'bonds': ['bond0', 'bond1'],
                'interface': ['eth0', 'eth1', 'ens160', 'ens192'],  # Common interfaces
                'interfaces': ['eth0', 'eth1', 'ens160', 'ens192']
            }
            
            # Add server-specific context if available
            if servers:
                first_server = servers[0]
                server_context['server_ip'] = first_server['ip']
                server_context['hostname'] = first_server.get('hostname', first_server['ip'])
                
            expanded_commands = []
            for cmd in commands:
                # Check if command contains variables that may need expansion
                variables_in_command = self.variable_expander.variable_pattern.findall(
                    (cmd.get('command', '') or '') +
                    (cmd.get('reference_value', '') or '') +
                    (cmd.get('expected_value', '') or '') +
                    (cmd.get('title', '') or '')
                )
                
                has_list_variables = False
                for var_name in variables_in_command:
                    var_value = server_context.get(var_name, '')
                    if isinstance(var_value, list) and len(var_value) > 1:
                        has_list_variables = True
                        break
                
                if has_list_variables:
                    # Use expand_command_list for commands with list variables
                    expanded_cmds = self.variable_expander.expand_command_list([cmd], server_context)
                    # Fallback: nếu triển khai không thay thế title, tự tay expand title/fields
                    fixed_cmds: List[Dict] = []
                    for idx, ec in enumerate(expanded_cmds):
                        new_ec = ec.copy()
                        # Ensure title is expanded as well
                        if 'title' in new_ec:
                            new_ec['title'] = self.variable_expander.expand_variables(new_ec['title'], server_context)
                        # Track expansion metadata
                        new_ec.setdefault('_expanded_from', cmd.get('title') or cmd.get('command'))
                        new_ec.setdefault('_expanded_variables', variables_in_command)
                        new_ec['_expanded_index'] = idx
                        fixed_cmds.append(new_ec)
                    expanded_commands.extend(fixed_cmds)
                else:
                    # Use simple expansion for commands without list variables
                    expanded_cmd = cmd.copy()
                    
                    # Expand variables in command field
                    if 'command' in expanded_cmd:
                        expanded_cmd['command'] = self.variable_expander.expand_variables(
                            expanded_cmd['command'], server_context
                        )
                    
                    # Expand variables in reference_value field for 6-column format
                    if 'reference_value' in expanded_cmd:
                        expanded_cmd['reference_value'] = self.variable_expander.expand_variables(
                            expanded_cmd['reference_value'], server_context
                        )
                    
                    # Expand variables in expected_value field for legacy format
                    if 'expected_value' in expanded_cmd:
                        expanded_cmd['expected_value'] = self.variable_expander.expand_variables(
                            expanded_cmd['expected_value'], server_context
                        )

                    # Expand variables in title
                    if 'title' in expanded_cmd:
                        expanded_cmd['title'] = self.variable_expander.expand_variables(
                            expanded_cmd['title'], server_context
                        )
                    
                    expanded_commands.append(expanded_cmd)
            
            logger.info(f"Expanded template variables: {len(commands)} -> {len(expanded_commands)} commands")
            return expanded_commands
            
        except Exception as e:
            logger.warning(f"Error expanding template variables: {str(e)}")
            return commands  # Return original commands if expansion fails

    def _annotate_display_index(self, original_commands: List[Dict], expanded_commands: List[Dict]) -> List[Dict]:
        """Attach stable display index (1..N of original list) to every (possibly expanded) command.
        This preserves UI progress and mapping at original 151 commands while allowing expansion.
        """
        # Build a map from an original command identity to its display index
        def _key(c: Dict) -> str:
            return str(c.get('command_id_ref') or c.get('command_id') or c.get('id') or c.get('title') or '')
        order_map: Dict[str, int] = {}
        for idx, oc in enumerate(original_commands):
            order_map[_key(oc)] = idx + 1  # 1-based
        
        annotated: List[Dict] = []
        for ec in expanded_commands:
            display_idx = order_map.get(_key(ec))
            new_cmd = ec.copy()
            if display_idx:
                new_cmd['_display_index'] = display_idx
            annotated.append(new_cmd)
        return annotated
    
    def _expand_dynamic_commands(self, commands: List[Dict], command_results: Dict[str, List[Dict]] = None) -> List[Dict]:
        """Expand commands dynamically based on previous command results"""
        try:
            if not command_results:
                return commands
                
            expanded_commands = self.variable_expander.expand_dynamic_commands(commands, command_results)
            
            if len(expanded_commands) != len(commands):
                logger.info(f"Dynamic expansion: {len(commands)} -> {len(expanded_commands)} commands")
                
            return expanded_commands
            
        except Exception as e:
            logger.warning(f"Error expanding dynamic commands: {str(e)}")
            return commands  # Return original commands if expansion fails
    
    def _update_smart_execution_progress(self, job_id: str, percentage: int, status_message: str = ""):
        """Update progress for smart execution"""
        try:
            if job_id in self.job_progress:
                old_percentage = self.job_progress[job_id].get('percentage', 0)
                self.job_progress[job_id].update({
                    'percentage': percentage
                })
                logger.info(f"PROGRESS UPDATE: {job_id} - {old_percentage}% → {percentage}% - {status_message}")
            
            if job_id in self.running_jobs:
                self.running_jobs[job_id]['progress'] = percentage
                logger.info(f"RUNNING JOB PROGRESS: {job_id} updated to {percentage}%")
                
        except Exception as e:
            logger.warning(f"Failed to update smart execution progress for {job_id}: {str(e)}")
    
    def _generate_summary(self, results: List[Dict], servers: List[Dict], assessment_type: str) -> Dict:
        """Generate summary for smart execution results"""
        total_commands = len(results)
        ok_count = sum(1 for r in results if r.get('validation_result', '').lower() in ['ok', 'ok (skipped)'])
        not_ok_count = sum(1 for r in results if r.get('validation_result', '').lower() == 'not ok')
        skipped_count = sum(1 for r in results if r.get('skipped', False))
        
        return {
            'assessment_type': assessment_type or 'Unknown',
            'total_servers': len(servers),
            'total_commands': total_commands,
            'ok_commands': ok_count,
            'not_ok_commands': not_ok_count,
            'skipped_commands': skipped_count,
            'success_rate': round((ok_count / total_commands * 100) if total_commands > 0 else 0, 2)
        }
    
    # ============ SEQUENTIAL EXECUTION HELPER METHODS ============
    
    def _check_skip_condition(self, command: Dict, reference_results: Dict, servers: List[Dict]) -> tuple[bool, str]:
        """Check if command should be skipped based on skip condition"""
        title = command.get('title', '')
        
        # Check for skip condition in title
        if '[SKIP_IF:' not in title:
            return False, ""
        
        try:
            # Extract skip condition (e.g., "[SKIP_IF:1p:non_empty]" or "[SKIP_IF:41p:"phy"]")
            skip_part = title[title.find('[SKIP_IF:'):title.find(']', title.find('[SKIP_IF:')) + 1]
            skip_condition = skip_part.replace('[SKIP_IF:', '').replace(']', '').strip()
            
            # Parse condition using colon as separator
            parts = skip_condition.split(':')
            if len(parts) < 2:
                return False, "Invalid skip condition format"
            
            ref_cmd_id = parts[0]
            condition_value = parts[1] if len(parts) > 1 else ""
            
            logger.info(f"Checking skip condition: {ref_cmd_id}:{condition_value}")
            
            # Check condition for each server
            skip_all_servers = True
            for server in servers:
                server_ip = server['ip']
                
                # Get reference result
                ref_output = ""
                if ref_cmd_id in reference_results and server_ip in reference_results[ref_cmd_id]:
                    ref_output = reference_results[ref_cmd_id][server_ip].strip()
                
                # Evaluate condition
                server_should_skip = False
                
                if condition_value == 'non_empty':
                    # Skip if reference has output (not empty)
                    server_should_skip = bool(ref_output)
                elif condition_value == 'empty':
                    # Skip if reference is empty
                    server_should_skip = not bool(ref_output)
                elif condition_value.startswith('"') and condition_value.endswith('"'):
                    # Skip if reference output matches specific value (remove quotes)
                    expected_value = condition_value[1:-1]
                    server_should_skip = (ref_output == expected_value)
                else:
                    # Skip if reference output matches specific value (without quotes)
                    server_should_skip = (ref_output == condition_value)
                    
                    if not server_should_skip:
                        skip_all_servers = False
                        break
            
            if skip_all_servers:
                return True, f"Reference command {ref_cmd_id} meets skip condition: {condition_value}"
            
            return False, ""
            
        except Exception as e:
            logger.warning(f"Error evaluating skip condition: {str(e)}")
            return False, f"Error in skip condition: {str(e)}"
    
    def _create_skipped_result(self, command: Dict, server_ip: str, skip_reason: str) -> Dict:
        """Create a result object for a skipped command"""
        return {
            'title': command.get('title', ''),
            'command': command.get('command', ''),
            'command_text': command.get('command', ''),
            'command_name': command.get('title', ''),
            'command_id_ref': command.get('command_id_ref', command.get('command_id', command.get('id', ''))),
            'server_ip': server_ip,
            'output': '',
            'error': '',
            'return_code': 0,
            'success': True,
            'is_valid': True,
            'skipped': True,
            'skip_reason': skip_reason,
            'validation_result': 'OK (skipped)',
            'decision': 'OK (skipped)',
            'expected': command.get('reference_value', ''),
            'reference_value': command.get('reference_value', ''),
            'validation_type': command.get('validation_type', 'exact_match')
        }
    
    def _expand_command_variables_inline(self, command: Dict, reference_results: Dict) -> List[Dict]:
        """Expand command variables inline and return list of commands to execute"""
        cmd_text = command.get('command', '')
        cmd_title = command.get('title', '')
        
        # Check if command has variables
        if '{{' not in cmd_text and '{{' not in cmd_title:
            return [command]  # No variables, return original command
        
        # Simple variable expansion - for now, just return original command
        # TODO: Implement actual variable expansion based on reference_results
        logger.info(f"Variable expansion needed for: {cmd_title}")
        return [command]  # Placeholder - return original for now

    def _preprocess_commands_for_single_playbook(self, commands: List[Dict]) -> List[Dict]:
        """Xử lý skip condition logic với hỗ trợ đầy đủ các điều kiện.
        Hỗ trợ format: [SKIP_IF:ref_id:non_empty], [SKIP_IF:ref_id:empty], [SKIP_IF:ref_id:"value"]
        """
        processed: List[Dict] = []
        
        for idx, cmd in enumerate(commands):
            new_cmd = cmd.copy()
            title = new_cmd.get('title', '')
            
            # Tìm skip condition
            if '[SKIP_IF:' in title and ']' in title:
                try:
                    # Extract skip condition
                    start = title.find('[SKIP_IF:') + 9
                    end = title.find(']', start)
                    if end > start:
                        skip_part = title[start:end]
                        parts = skip_part.split(':')
                        
                        if len(parts) >= 2:
                            ref_id = parts[0].strip()
                            condition_value = parts[1].strip() if len(parts) > 1 else ""
                            
                            # Sanitize ref_id for ansible variable name
                            safe_ref_id = re.sub(r"[^A-Za-z0-9_]", "_", str(ref_id))
                            
                            # Tạo when condition dựa trên loại điều kiện
                            if condition_value == 'non_empty':
                                # Skip nếu có output → run khi không có output
                                new_cmd['when'] = f"result_id_{safe_ref_id}.stdout is not defined or result_id_{safe_ref_id}.stdout == ''"
                            elif condition_value == 'empty':
                                # Skip nếu không có output → run khi có output
                                new_cmd['when'] = f"result_id_{safe_ref_id}.stdout is defined and result_id_{safe_ref_id}.stdout != ''"
                            elif condition_value.startswith('"') and condition_value.endswith('"'):
                                # Skip nếu output khớp với giá trị cụ thể → run khi không khớp
                                expected_value = condition_value[1:-1]  # Remove quotes
                                new_cmd['when'] = f"result_id_{safe_ref_id}.stdout is not defined or result_id_{safe_ref_id}.stdout != '{expected_value}'"
                            else:
                                # Skip nếu output khớp với giá trị cụ thể (không có quotes) → run khi không khớp
                                new_cmd['when'] = f"result_id_{safe_ref_id}.stdout is not defined or result_id_{safe_ref_id}.stdout != '{condition_value}'"
                            
                            logger.info(f"Added skip condition for command {idx+1}: {new_cmd.get('when', 'none')}")
                except Exception as e:
                    logger.warning(f"Error processing skip condition for command {idx+1}: {str(e)}")
                    # Continue without skip condition if parsing fails
            
            processed.append(new_cmd)
        return processed
    
    def _execute_single_command_on_servers(self, command: Dict, servers: List[Dict], temp_dir: str) -> List[Dict]:
        """Execute a single command on all servers"""
        try:
            logger.info(f"Executing command: {command.get('title', '')}")
            
            # Create mini playbook for this single command
            playbook_dir = self.create_dynamic_playbook([command], servers)
            
            # Execute playbook
            result = run(
                playbook=os.path.join(playbook_dir, "dynamic_commands.yml"),
                inventory=os.path.join(playbook_dir, "inventory.yml"),
                private_data_dir=playbook_dir,
                forks=50,
                quiet=True
            )
            
            # Process results for each server
            results = []
            for server in servers:
                server_ip = server['ip']
                
                cmd_result = {
                    'title': command.get('title', ''),
                    'command': command.get('command', ''),
                    'command_text': command.get('command', ''),
                    'command_name': command.get('title', ''),
                    'command_id_ref': command.get('command_id_ref', command.get('command_id', command.get('id', ''))),
                    'server_ip': server_ip,
                    'output': '',
                    'error': '',
                    'return_code': None,
                    'success': False,
                    'is_valid': False,
                    'expected': command.get('reference_value', ''),
                    'reference_value': command.get('reference_value', ''),
                    'validation_type': command.get('validation_type', 'exact_match'),
                    'skipped': False,
                    'skip_reason': ''
                }
                
                # Extract result from ansible output
                try:
                    if hasattr(result, 'events') and result.events:
                        for event in result.events:
                            if (event.get('event') in ['runner_on_ok', 'runner_on_failed'] and 
                                event.get('event_data', {}).get('host') == server_ip):
                                res = event.get('event_data', {}).get('res', {})
                                cmd_result.update({
                                    'output': res.get('stdout', ''),
                                    'error': res.get('stderr', ''),
                                    'return_code': res.get('rc', 0),
                                    'success': res.get('rc', 1) == 0
                                })
                                break
                except Exception as e:
                    logger.warning(f"Error processing result for {server_ip}: {str(e)}")
                    cmd_result['error'] = f"Error processing result: {str(e)}"
                
                # Perform validation
                try:
                    from .advanced_validator import AdvancedValidator
                    validator = AdvancedValidator()
                    
                    expected_value = command.get('reference_value', '')
                    validation = validator.validate_output(
                        cmd_result.get('output', ''),
                        expected_value,
                        'exact_match'  # Default validation
                    )
                    
                    cmd_result.update({
                        'is_valid': validation.get('is_valid', False),
                        'validation_result': 'OK' if validation.get('is_valid', False) else 'Not OK',
                        'decision': 'APPROVED' if validation.get('is_valid', False) else 'REJECTED',
                        'validation_details': validation
                    })
                except Exception as e:
                    logger.warning(f"Validation error: {str(e)}")
                    cmd_result.update({
                        'is_valid': False,
                        'validation_result': 'Not OK',
                        'decision': 'REJECTED'
                    })
                
                results.append(cmd_result)
            
            # Cleanup
            import shutil
            shutil.rmtree(playbook_dir, ignore_errors=True)
            
            return results
            
        except Exception as e:
            logger.error(f"Error executing command: {str(e)}")
            # Return error results for all servers
            error_results = []
            for server in servers:
                error_result = self._create_error_result(command, server['ip'], str(e))
                error_results.append(error_result)
            return error_results
    
    def _create_error_result(self, command: Dict, server_ip: str, error_message: str) -> Dict:
        """Create a result object for a failed command"""
        return {
            'title': command.get('title', ''),
            'command': command.get('command', ''),
            'command_text': command.get('command', ''),
            'command_name': command.get('title', ''),
            'command_id_ref': command.get('command_id_ref', command.get('command_id', command.get('id', ''))),
            'server_ip': server_ip,
            'output': '',
            'error': error_message,
            'return_code': -1,
            'success': False,
            'is_valid': False,
            'skipped': False,
            'skip_reason': '',
            'validation_result': 'Not OK',
            'decision': 'REJECTED',
            'expected': command.get('reference_value', ''),
            'reference_value': command.get('reference_value', ''),
            'validation_type': command.get('validation_type', 'exact_match')
        }
    
    def _finalize_sequential_results(self, job_id: str, all_results: List[Dict], servers: List[Dict], timestamp: str, execution_id: int = None, assessment_type: str = None) -> Dict:
        """Finalize and save sequential execution results"""
        logger.info(f"Finalizing sequential results: {len(all_results)} results")
        
        # Group results by server
        server_results = {}
        for server in servers:
            server_ip = server['ip']
            server_results[server_ip] = {
                'ip': server_ip,
                'admin_username': server['admin_username'],
                'root_username': server['root_username'],
                'commands': [],
                'status': 'success',
                'error': None
            }
        
        # Organize results by server
        for result in all_results:
            server_ip = result.get('server_ip', '')
            if server_ip in server_results:
                server_results[server_ip]['commands'].append(result)
        
        # Generate summary
        summary = self._generate_summary(all_results, servers, assessment_type)
        
        # Store final results
        final_result = {
            'job_id': job_id,
            'timestamp': timestamp,
            'summary': summary,
            'servers': server_results,
            'status': 'completed'
        }
        
        self.job_results[job_id] = final_result
        
        # Create logs (simplified for now)
        self.job_logs[job_id] = {
            'log_content': f"Sequential execution completed: {len(all_results)} results",
            'last_updated': datetime.now(GMT_PLUS_7).isoformat(),
            'status': 'completed'
        }
        
        return final_result