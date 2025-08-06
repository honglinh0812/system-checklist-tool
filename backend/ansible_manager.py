from ansible_runner import run
import json
import os
import tempfile
import yaml
from datetime import datetime
import logging
from typing import Dict, List, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AnsibleRunner:
    def __init__(self, playbook_dir: str = "./ansible/playbooks"):
        self.playbook_dir = playbook_dir
        self.running_jobs = {}
        
    def create_dynamic_playbook(self, checklist_items: List[Dict], target_ips: List[str]) -> str:
        logger.info(f"Creating dynamic playbook for {len(checklist_items)} items")
        
        temp_dir = tempfile.mkdtemp()
        
        inventory_content = {
            "all": {
                "hosts": {},
                "vars": {
                    "ansible_ssh_common_args": "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null",
                    "ansible_user": "root",
                    "ansible_connection": "ssh",
                    "ansible_ssh_private_key_file": "~/.ssh/id_rsa"
                }
            }
        }
        
        for ip in target_ips:
            if ip in ['localhost', '127.0.0.1']:
                inventory_content["all"]["hosts"][ip] = {
                    "ansible_connection": "local",
                    "ansible_become": False
                }
            else:
                inventory_content["all"]["hosts"][ip] = {
                    "ansible_ssh_private_key_file": "~/.ssh/id_rsa",
                    "ansible_become": True,
                    "ansible_become_method": "sudo"
                }
            
        if not target_ips:
            logger.warning("No target IPs provided, using localhost for testing")
            inventory_content["all"]["hosts"]["localhost"] = {
                "ansible_connection": "local"
            }
        
        logger.info(f"Created inventory with hosts: {list(inventory_content['all']['hosts'].keys())}")
        
        existing_playbook = os.path.join(self.playbook_dir, "system_checklist.yml")
        if os.path.exists(existing_playbook):
            logger.info(f"Using existing playbook: {existing_playbook}")
            playbook_path = os.path.join(temp_dir, "system_checklist.yml")
            import shutil
            shutil.copy2(existing_playbook, playbook_path)
        else:   
            tasks = []
            for item in checklist_items:
                if not item.get('enabled', True):
                    continue
                    
                task_name = item['name']
                task_type = item.get('type', 'task')
                
                if task_type == 'task':
                    task = {
                        "name": task_name,
                        "shell": self._get_task_command(item),
                        "register": f"result_{item['id']}",
                        "ignore_errors": True
                    }
                elif task_type == 'check':
                    task = {
                        "name": task_name,
                        "shell": self._get_check_command(item),
                        "register": f"check_{item['id']}",
                        "ignore_errors": True
                    }
                else:
                    task = {
                        "name": task_name,
                        "debug": {
                            "msg": f"Info: {item.get('description', '')}"
                        }
                    }
                
                tasks.append(task)
            
            playbook_content = [{
                "name": "Dynamic System Checklist",
                "hosts": "all",
                "gather_facts": True,
                "tasks": tasks
            }]
            
            playbook_path = os.path.join(temp_dir, "dynamic_checklist.yml")
            
            with open(playbook_path, 'w') as f:
                yaml.dump(playbook_content, f, default_flow_style=False)
        
        inventory_path = os.path.join(temp_dir, "inventory.yml")
        
        with open(inventory_path, 'w') as f:
            yaml.dump(inventory_content, f, default_flow_style=False)
            
        logger.info(f"Using playbook: {playbook_path}")
        logger.info(f"Using inventory: {inventory_path}")
        return temp_dir, playbook_path, inventory_path
    
    def _get_task_command(self, item: Dict) -> str:
        item_name = item['name'].lower()
        
        if 'os information' in item_name:
            return "uname -a && cat /etc/os-release"
        elif 'system services' in item_name:
            return "systemctl list-units --type=service --state=running | head -20"
        elif 'disk usage' in item_name:
            return "df -h"
        elif 'network' in item_name:
            return "ip addr show"
        else:
            return "echo 'Task completed'"
    
    def _get_check_command(self, item: Dict) -> str:
        item_name = item['name'].lower()
        
        if 'ssh' in item_name:
            return "grep -E '^(PermitRootLogin|PasswordAuthentication)' /etc/ssh/sshd_config"
        elif 'firewall' in item_name:
            return "systemctl is-active firewalld"
        else:
            return "echo 'Check completed'"
    
    def run_playbook(self, job_id: int, checklist_items: List[Dict], target_ips: List[str]) -> Dict:
        logger.info(f"Starting Ansible playbook for job {job_id}")
        
        try:
            temp_dir, playbook_path, inventory_path = self.create_dynamic_playbook(checklist_items, target_ips)
            
            self.running_jobs[job_id] = {
                'status': 'running',
                'current_task': 0,
                'total_tasks': len([item for item in checklist_items if item.get('enabled', True)]),
                'start_time': datetime.now(),
                'progress': 0,
                'logs': []
            }
            
            logger.info(f"Running ansible-runner with playbook: {playbook_path}")
            result = run(
                playbook=playbook_path,
                inventory=inventory_path,
                private_data_dir=temp_dir,
                quiet=False
            )
            
            logger.info(f"Ansible-runner completed with status: {result.status}")
            logger.info(f"Ansible-runner return code: {result.rc}")
            
            results = self._process_ansible_results(result, checklist_items)
            
            self.running_jobs[job_id]['status'] = 'completed'
            self.running_jobs[job_id]['progress'] = 100
            self.running_jobs[job_id]['end_time'] = datetime.now()
            
            logger.info(f"Ansible playbook completed for job {job_id}")
            return results
            
        except Exception as e:
            logger.error(f"Error running Ansible playbook for job {job_id}: {str(e)}")
            self.running_jobs[job_id]['status'] = 'failed'
            self.running_jobs[job_id]['error'] = str(e)
            raise
    
    def _process_ansible_results(self, result: Any, checklist_items: List[Dict]) -> Dict:
        logger.info("Processing Ansible results")
        
        processed_results = {
            'summary': {
                'total_items': len(checklist_items),
                'completed_items': 0,
                'failed_items': 0,
                'score': 0
            },
            'items': [],
            'raw_output': {}
        }
        
        for item in checklist_items:
            if not item.get('enabled', True):
                continue
                
            item_result = {
                'id': item['id'],
                'name': item['name'],
                'type': item.get('type', 'task'),
                'status': 'completed',
                'output': '',
                'score': 100,
                'passed': True
            }
            
            register_name = f"result_{item['id']}" if item.get('type') == 'task' else f"check_{item['id']}"
            
            item_result = self._evaluate_item_result(item, item_result, result)
            
            processed_results['items'].append(item_result)
            
            if item_result['passed']:
                processed_results['summary']['completed_items'] += 1
            else:
                processed_results['summary']['failed_items'] += 1
        
        if processed_results['summary']['total_items'] > 0:
            processed_results['summary']['score'] = (
                processed_results['summary']['completed_items'] / 
                processed_results['summary']['total_items'] * 100
            )
        
        logger.info(f"Processed results: {processed_results['summary']}")
        return processed_results
    
    def _evaluate_item_result(self, item: Dict, item_result: Dict, ansible_result: Any) -> Dict:
        item_name = item['name'].lower()
        
        if 'ssh' in item_name:
            if hasattr(ansible_result, 'events'):
                for event in ansible_result.events:
                    if event.get('event') == 'runner_on_ok':
                        output = event.get('event_data', {}).get('res', {}).get('stdout', '')
                        if 'PermitRootLogin no' in output and 'PasswordAuthentication no' in output:
                            item_result['passed'] = True
                            item_result['score'] = 100
                        else:
                            item_result['passed'] = False
                            item_result['score'] = 0
                        item_result['output'] = output
                        item_result['status'] = 'completed'
                        break
        
        elif 'firewall' in item_name:
            if hasattr(ansible_result, 'events'):
                for event in ansible_result.events:
                    if event.get('event') == 'runner_on_ok':
                        output = event.get('event_data', {}).get('res', {}).get('stdout', '').strip()
                        if output == 'active':
                            item_result['passed'] = True
                            item_result['score'] = 100
                        else:
                            item_result['passed'] = False
                            item_result['score'] = 0
                        item_result['output'] = output
                        item_result['status'] = 'completed'
                        break
        
        else:
            if hasattr(ansible_result, 'events'):
                for event in ansible_result.events:
                    if event.get('event') == 'runner_on_ok':
                        output = event.get('event_data', {}).get('res', {}).get('stdout', '')
                        if output:
                            item_result['passed'] = True
                            item_result['score'] = 100
                        else:
                            item_result['passed'] = False
                            item_result['score'] = 0
                        item_result['output'] = output
                        item_result['status'] = 'completed'
                        break
        
        return item_result
    
    def get_job_status(self, job_id: int) -> Optional[Dict]:
        return self.running_jobs.get(job_id)
    
    def get_job_logs(self, job_id: int) -> List[str]:
        """Lấy logs của job"""
        job_status = self.running_jobs.get(job_id)
        if job_status:
            return job_status.get('logs', [])
        return []

ansible_runner_instance = AnsibleRunner() 