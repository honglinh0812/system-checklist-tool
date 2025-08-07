from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from datetime import datetime
import os
import json
import pandas as pd
import tempfile
import shutil
from werkzeug.utils import secure_filename
from typing import Dict, List, Any
import logging
import re
from command_validator import CommandValidator
from ansible_manager import AnsibleRunner

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('logs', exist_ok=True)

# Initialize components
command_validator = CommandValidator()
ansible_runner = AnsibleRunner()

# Global storage for current session (in production, use Redis or database)
current_servers = []
current_commands = []

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

@app.route('/api/template/download', methods=['GET'])
def download_template():
    """Download server list template"""
    try:
        template_path = 'templates/server_list_template.xlsx'
        if os.path.exists(template_path):
            return send_file(template_path, as_attachment=True, download_name='server_list_template.xlsx')
        else:
            return jsonify({'error': 'Template file not found'}), 404
    except Exception as e:
        logger.error(f"Error downloading template: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/templates/commands', methods=['GET'])
def get_command_templates():
    """Get available command templates"""
    try:
        template_path = 'templates/command_templates.json'
        if os.path.exists(template_path):
            with open(template_path, 'r', encoding='utf-8') as f:
                templates = json.load(f)
            return jsonify(templates)
        else:
            return jsonify({'templates': []})
    except Exception as e:
        logger.error(f"Error loading command templates: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/upload/servers', methods=['POST'])
def upload_servers():
    """Upload server list file (xls, xlsx, txt)"""
    global current_servers
    
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file:
            return jsonify({'error': 'Invalid file'}), 400
        
        # Check file extension
        allowed_extensions = {'xls', 'xlsx', 'txt', 'csv'}
        file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        
        if file_extension not in allowed_extensions:
            return jsonify({'error': f'File type not allowed. Allowed types: {", ".join(allowed_extensions)}'}), 400
        
        # Save file temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Parse file based on extension
        servers = []
        try:
            if file_extension in ['xls', 'xlsx']:
                df = pd.read_excel(filepath)
            elif file_extension in ['txt', 'csv']:
                df = pd.read_csv(filepath)
            else:
                return jsonify({'error': 'Unsupported file format'}), 400
            
            # Check for both old and new column formats
            old_required_columns = ['IP', 'admin_username', 'admin_password', 'root_username', 'root_password']
            new_required_columns = ['IP', 'ssh_username', 'ssh_password', 'sudo_username', 'sudo_password']
            
            # Determine which format is being used
            if all(col in df.columns for col in old_required_columns):
                # Old format
                column_mapping = {
                    'IP': 'ip',
                    'admin_username': 'admin_username',
                    'admin_password': 'admin_password',
                    'root_username': 'root_username',
                    'root_password': 'root_password'
                }
            elif all(col in df.columns for col in new_required_columns):
                # New format
                column_mapping = {
                    'IP': 'ip',
                    'ssh_username': 'admin_username',
                    'ssh_password': 'admin_password',
                    'sudo_username': 'root_username',
                    'sudo_password': 'root_password'
                }
            else:
                missing_old = [col for col in old_required_columns if col not in df.columns]
                missing_new = [col for col in new_required_columns if col not in df.columns]
                return jsonify({
                    'error': f'Invalid file format. Required columns:\nOld format: {", ".join(old_required_columns)}\nNew format: {", ".join(new_required_columns)}'
                }), 400
            
            # Convert to list of dictionaries
            for _, row in df.iterrows():
                server = {}
                for file_col, internal_col in column_mapping.items():
                    server[internal_col] = str(row[file_col]).strip()
                servers.append(server)
            
            # Clean up temporary file
            os.remove(filepath)
            
            # Store servers globally
            current_servers = servers
            
            return jsonify({
                'message': 'File uploaded successfully',
                'servers': servers,
                'count': len(servers)
            })
            
        except Exception as e:
            # Clean up on error
            if os.path.exists(filepath):
                os.remove(filepath)
            logger.error(f"Error parsing file: {str(e)}")
            return jsonify({'error': f'Error parsing file: {str(e)}'}), 400
            
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/servers/add', methods=['POST'])
def add_manual_server():
    """Add server manually via JSON"""
    global current_servers
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate required fields
        required_fields = ['ip', 'admin_username', 'admin_password', 'root_username', 'root_password']
        missing_fields = [field for field in required_fields if field not in data or not data[field].strip()]
        
        if missing_fields:
            return jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 400
        
        # Create server object
        server = {
            'ip': data['ip'].strip(),
            'admin_username': data['admin_username'].strip(),
            'admin_password': data['admin_password'].strip(),
            'root_username': data['root_username'].strip(),
            'root_password': data['root_password'].strip()
        }
        
        # Check if server already exists
        existing_ips = [s['ip'] for s in current_servers]
        if server['ip'] in existing_ips:
            return jsonify({'error': f'Server with IP {server["ip"]} already exists'}), 400
        
        # Add to current servers
        current_servers.append(server)
        
        logger.info(f"Added manual server: {server['ip']}")
        
        return jsonify({
            'message': 'Server added successfully',
            'server': server,
            'total_servers': len(current_servers)
        })
        
    except Exception as e:
        logger.error(f"Error adding manual server: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/commands/validate', methods=['POST'])
def validate_command():
    """Validate a shell command"""
    try:
        data = request.get_json()
        if not data or 'command' not in data:
            return jsonify({'error': 'Command is required'}), 400
        
        command = data['command'].strip()
        
        # Validate command
        validation_result = command_validator.validate_command(command)
        
        return jsonify(validation_result)
        
    except Exception as e:
        logger.error(f"Error validating command: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/commands/run', methods=['POST'])
def run_commands():
    """Run commands on selected servers"""
    global current_servers, current_commands
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        selected_servers = data.get('selected_servers', [])
        commands = data.get('commands', [])
        
        if not selected_servers:
            return jsonify({'error': 'No servers selected'}), 400
        
        if not commands:
            return jsonify({'error': 'No commands provided'}), 400
        
        for cmd in commands:
            if 'command' not in cmd or not cmd['command'].strip():
                return jsonify({'error': 'Tất cả lệnh phải có nội dung câu lệnh'}), 400
            
            validation_result = command_validator.validate_command(cmd['command'])
            if not validation_result['valid']:
                error_msg = f'Lệnh không hợp lệ: {cmd.get("title", "Không xác định")}'
                if validation_result.get('syntax_error'):
                    error_msg += f' - Lỗi cú pháp: {validation_result["syntax_error"]}'
                elif validation_result.get('errors'):
                    error_msg += f' - {", ".join(validation_result["errors"])}'
                
                return jsonify({
                    'error': error_msg,
                    'details': validation_result
                }), 400
        
        servers_to_run = []
        for server in current_servers:
            if server['ip'] in selected_servers:
                servers_to_run.append(server)
        
        if not servers_to_run:
            return jsonify({'error': 'No valid servers found'}), 400
        
        current_commands = commands
        
        timestamp = datetime.now().strftime("%H%M%S_%d%m%Y")
        job_id = f"job_{timestamp}"
        
        import threading
        thread = threading.Thread(
            target=ansible_runner.run_playbook,
            args=(job_id, commands, servers_to_run, timestamp)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'message': 'Commands started successfully',
            'job_id': job_id,
            'servers_count': len(servers_to_run),
            'commands_count': len(commands)
        })
        
    except Exception as e:
        logger.error(f"Error running commands: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/commands/status/<job_id>', methods=['GET'])
def get_command_status(job_id):
    """Get status of command execution"""
    try:
        status = ansible_runner.get_job_status(job_id)
        if status:
            return jsonify(status)
        else:
            return jsonify({'error': 'Job not found'}), 404
            
    except Exception as e:
        logger.error(f"Error getting job status: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/commands/results/<job_id>', methods=['GET'])
def get_command_results(job_id):
    """Get results of command execution"""
    try:
        results = ansible_runner.get_job_results(job_id)
        if results:
            return jsonify(results)
        else:
            return jsonify({'error': 'Results not found'}), 404
            
    except Exception as e:
        logger.error(f"Error getting job results: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/logs/<job_id>', methods=['GET'])
def get_job_logs(job_id):
    """Get detailed logs for a job"""
    try:
        logs = ansible_runner.get_job_logs(job_id)
        if logs:
            return jsonify({'logs': logs})
        else:
            return jsonify({'error': 'Logs not found'}), 404
            
    except Exception as e:
        logger.error(f"Error getting job logs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/logs/<job_id>/download', methods=['GET'])
def download_job_logs(job_id):
    """Download log file for a job"""
    try:
        logs = ansible_runner.get_job_logs(job_id)
        if not logs or 'log_file' not in logs:
            return jsonify({'error': 'Log file not found'}), 404
        
        log_file_path = logs['log_file']
        if not os.path.exists(log_file_path):
            return jsonify({'error': 'Log file not found on disk'}), 404
        
        # Get filename from path
        filename = os.path.basename(log_file_path)
        
        return send_file(
            log_file_path,
            as_attachment=True,
            download_name=filename,
            mimetype='text/plain'
        )
        
    except Exception as e:
        logger.error(f"Error downloading job logs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 