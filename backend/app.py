import os
import json
import uuid
import threading
import tempfile
import shutil
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, session, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity, get_jwt
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from core.auth import init_jwt, authenticate_user, generate_tokens, revoke_token, get_current_user as jwt_get_current_user
from api.api_utils import api_response, api_error, paginate_query, validate_json, admin_required
from core.schemas import LoginSchema, RefreshTokenSchema
from api.api_dashboard import dashboard_bp
from api.api_users import users_bp
from api.api_mops import mops_bp
from api.api_commands import commands_bp, executions_bp
from api.api_assessments import assessments_bp
from api.api_audit import audit_bp
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import pandas as pd
from config.config import Config, DevelopmentConfig, ProductionConfig
from models import init_db, db
from models.user import User
from models.mop import MOP, Command, MOPFile, MOPReview
from models.execution import ExecutionHistory, ServerResult
from models.report import RiskReport
from services.command_validator import CommandValidator
from services.ansible_manager import AnsibleRunner
from services.excel_exporter import ExcelExporter
from services.logging_system import LoggingSystem

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize logging system
logging_system = LoggingSystem()

def create_app(config_name='development'):
    app = Flask(__name__)
    
    # Load config
    if config_name == 'development':
        app.config.from_object(DevelopmentConfig)
    elif config_name == 'production':
        app.config.from_object(ProductionConfig)
    else:
        app.config.from_object(Config)
    
    # Force DB URI to use system_checklist database
    Config.init_app(app)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:postgres@localhost/system_checklist'
    logger.info(f"[BOOT] Using DB URI: {app.config['SQLALCHEMY_DATABASE_URI']}")
    
    # Initialize extensions
    CORS(app, origins=app.config.get('CORS_ORIGINS', ['*']))
    init_db(app)
    
    # Initialize JWT
    init_jwt(app)
    
    # Initialize rate limiting
    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=[app.config.get('RATELIMIT_DEFAULT', '100 per hour')]
    )
    limiter.init_app(app)
    
    # Performance optimizations for production
    if config_name == 'production':
        # Enable response compression
        from flask_compress import Compress
        Compress(app)
        
        # Add security headers
        @app.after_request
        def add_security_headers(response):
            response.headers['X-Content-Type-Options'] = 'nosniff'
            response.headers['X-Frame-Options'] = 'DENY'
            response.headers['X-XSS-Protection'] = '1; mode=block'
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
            return response
            
        # Add caching headers for static files
        @app.after_request
        def add_cache_headers(response):
            if request.endpoint and 'static' in request.endpoint:
                response.headers['Cache-Control'] = 'public, max-age=31536000'
            return response
    
    # Start APScheduler for periodic risk assessments
    from services.scheduler import init_scheduler
    init_scheduler(app)
    
    try:
        with app.app_context():
            from models.user import User as _DbgUser
            total_users = _DbgUser.query.count()
            logger.info(f"[BOOT] Users in DB at startup: {total_users}")
    except Exception as e:
        logger.warning(f"[BOOT] DB check failed: {e}")
    
    # Register API blueprints
    # Using non-versioned API endpoints
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(mops_bp)
    app.register_blueprint(commands_bp)
    app.register_blueprint(executions_bp)
    app.register_blueprint(assessments_bp)
    app.register_blueprint(audit_bp)
    
    return app

app = create_app(os.getenv('FLASK_ENV', 'development'))

# Initialize components
command_validator = CommandValidator()
ansible_runner = AnsibleRunner()
excel_exporter = ExcelExporter()

# Global storage for current session (in production, use Redis or database)
current_servers = []
current_commands = []

# API endpoints for risk reports
@app.route('/api/risk-reports', methods=['GET'])
@jwt_required()
def list_risk_reports():
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 30))
        q = RiskReport.query.order_by(RiskReport.created_at.desc())
        pagination = q.paginate(page=page, per_page=per_page, error_out=False)
        reports_json = []
        for r in pagination.items:
            reports_json.append({
                'id': r.id,
                'created_at': r.created_at.isoformat(),
                'summary': r.summary,
                'excel_path': r.excel_path.split('/')[-1],
                'log_path': r.log_path.split('/')[-1]
            })
        return jsonify({
            'success': True,
            'reports': reports_json,
            'total': pagination.total
        })
    except Exception as e:
        logger.error(f"Error listing reports: {e}")
        return jsonify({'error': 'Internal error'}), 500

@app.route('/api/risk-reports/<int:report_id>/download/<file_type>', methods=['GET'])
@jwt_required()
def download_risk_report_file(report_id, file_type):
    try:
        report = RiskReport.query.get(report_id)
        if not report:
            return jsonify({'error': 'Report not found'}), 404
        if file_type == 'excel':
            path = report.excel_path
        elif file_type == 'log':
            path = report.log_path
        else:
            return jsonify({'error': 'Invalid file type'}), 400
        if not path or not os.path.exists(path):
            return jsonify({'error': 'File not found'}), 404
        return send_file(path, as_attachment=True, download_name=os.path.basename(path))
    except Exception as e:
        logger.error(f"Download error: {e}")
        return jsonify({'error': 'Internal error'}), 500

# Initialize components
command_validator = CommandValidator()
ansible_runner = AnsibleRunner()
excel_exporter = ExcelExporter()

# Global storage for current session (in production, use Redis or database)
current_servers = []
current_commands = []

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login with JWT"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            # Generate JWT tokens
            tokens = generate_tokens(user)
            
            return jsonify({
                'access_token': tokens['access_token'],
                'refresh_token': tokens.get('refresh_token'),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email if user.email else '',
                    'role': user.role,
                    'created_at': user.created_at.isoformat() if user.created_at else '',
                    'updated_at': ''
                }
            })
        else:
            return jsonify({'error': 'Invalid username or password'}), 401
            
    except Exception as e:
        logger.error(f"Error during login: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/logout', methods=['POST'])
@jwt_required()
def logout():
    """User logout"""
    try:
        # Get JWT token ID and revoke it
        jti = get_jwt()['jti']
        revoke_token(jti)
        return jsonify({'message': 'Logout successful'})
    except Exception as e:
        logger.error(f"Error during logout: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh JWT token"""
    try:
        current_user_id = get_jwt_identity()
        user = User.query.get(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        tokens = generate_tokens(user)
        return jsonify({
            'access_token': tokens['access_token'],
            'refresh_token': tokens.get('refresh_token'),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': '',
                'role': user.role,
                'created_at': user.created_at.isoformat() if user.created_at else '',
                'updated_at': ''
            }
        })
    except Exception as e:
        logger.error(f"Error refreshing token: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/user', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info"""
    try:
        user = jwt_get_current_user()
        if not user:
            logger.error("User not found from JWT token")
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'id': user.id,
            'username': user.username,
            'email': '',
            'role': user.role,
            'created_at': user.created_at.isoformat() if user.created_at else '',
            'updated_at': ''
        })
    except Exception as e:
        logger.error(f"Error getting current user: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

# User Management Endpoints - Moved to api/api_users.py blueprint
# Routes: /api/users (GET, POST), /api/users/<id> (GET, DELETE)

# DELETE /api/users/<id> route moved to api/api_users.py blueprint

# MOP Management Endpoints - Moved to api/api_mops.py blueprint
# Routes: /api/mops (GET, POST), /api/mops/<id> (GET, PUT, DELETE), /api/mops/upload, etc.

# Risk assessment and handover assessment routes - these might be specific to app.py
# TODO: Check if these should be moved to blueprint or kept here
# MOP risk assessment and handover assessment routes moved to api/api_assessments.py blueprint

# GET /api/mops/<id> route moved to api/api_mops.py blueprint

# MOP file download, update, delete routes moved to api/api_mops.py blueprint

# MOP upload route moved to api/api_mops.py blueprint

# MOP review route moved to api/api_mops.py blueprint

# MOP pending route moved to api/api_mops.py blueprint

# Server Management Endpoints
@app.route('/api/servers', methods=['GET'])
@jwt_required()
def get_servers():
    """Get list of current servers"""
    try:
        return jsonify({
            'success': True,
            'servers': current_servers
        })
    except Exception as e:
        logger.error(f"Error getting servers: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/servers/test-connection', methods=['POST'])
@jwt_required()
def test_server_connection():
    """Test SSH and sudo connection to server"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        ip = data.get('ip')
        admin_username = data.get('admin_username')
        admin_password = data.get('admin_password')
        root_username = data.get('root_username')
        root_password = data.get('root_password')
        
        if not all([ip, admin_username, admin_password, root_username, root_password]):
            return jsonify({'error': 'All server credentials are required'}), 400
        
        # Create test server object
        test_server = {
            'ip': ip,
            'admin_username': admin_username,
            'admin_password': admin_password,
            'root_username': root_username,
            'root_password': root_password
        }
        
        # Test with simple command
        test_commands = [{
            'title': 'Connection Test',
            'command': 'echo "Connection test successful"'
        }]
        
        timestamp = datetime.now().strftime("%H%M%S_%d%m%Y")
        job_id = f"test_{timestamp}"
        
        # Run test in background
        import threading
        thread = threading.Thread(
            target=ansible_runner.run_playbook,
            args=(job_id, test_commands, [test_server], timestamp)
        )
        thread.daemon = True
        thread.start()
        
        # Wait a bit for the test to complete
        import time
        time.sleep(5)
        
        # Check results
        results = ansible_runner.get_job_results(job_id)
        if results and results.get('summary', {}).get('successful_servers', 0) > 0:
            return jsonify({
                'success': True,
                'message': 'Connection test successful'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Connection test failed. Please check credentials and network connectivity.'
            })
        
    except Exception as e:
        logger.error(f"Error testing server connection: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Connection test failed: {str(e)}'
        })

@app.route('/api/servers/validate', methods=['POST'])
@jwt_required()
def validate_server():
    """Validate server before adding to list"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        server_ip = data.get('server_ip')
        ssh_username = data.get('ssh_username')
        ssh_password = data.get('ssh_password')
        
        if not all([server_ip, ssh_username, ssh_password]):
            return jsonify({'error': 'Server IP, SSH username, and SSH password are required'}), 400
        
        # Validate IP format
        import re
        ip_pattern = re.compile(r'^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$')
        if not ip_pattern.match(server_ip):
            return jsonify({'error': 'Invalid IP address format'}), 400
        
        # Test connection
        test_data = {
            'ip': server_ip,
            'admin_username': ssh_username,
            'admin_password': ssh_password,
            'root_username': ssh_username,
            'root_password': ssh_password
        }
        
        # Test with simple command
        test_commands = [{
            'title': 'Connection Test',
            'command': 'echo "Connection test successful"'
        }]
        
        timestamp = datetime.now().strftime("%H%M%S_%d%m%Y")
        job_id = f"validate_{timestamp}"
        
        # Run test in background
        import threading
        thread = threading.Thread(
            target=ansible_runner.run_playbook,
            args=(job_id, test_commands, [test_data], timestamp)
        )
        thread.daemon = True
        thread.start()
        
        # Wait a bit for the test to complete
        import time
        time.sleep(5)
        
        # Check results
        results = ansible_runner.get_job_results(job_id)
        if results and results.get('summary', {}).get('successful_servers', 0) > 0:
            # Add to server list if connection successful
            server_data = {
                'ip': server_ip,
                'ssh_username': ssh_username,
                'ssh_password': ssh_password,
                'validated': True,
                'validated_at': datetime.utcnow().isoformat()
            }
            
            return jsonify({
                'success': True,
                'message': 'Server validated and ready to add',
                'server_data': server_data
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Connection test failed. Please check credentials and network connectivity.'
            }), 400
            
    except Exception as e:
        logger.error(f"Error validating server: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

# Execution History Endpoints moved to api_commands.py

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

# -----------------------------
# MOP Appendix template (3 columns)
# -----------------------------
@app.route('/api/template/mop-appendix', methods=['GET'])
def download_mop_appendix_template():
    """Download MOP appendix template (Command Name, Command, Reference Value)"""
    try:
        from io import BytesIO
        import pandas as pd
        sample_rows = [
            {"Command Name": "SSH1 - Check root login", "Command": "grep -i '^PermitRootLogin' /etc/ssh/sshd_config", "Reference Value": "no"},
            {"Command Name": "SSH2 - Check PasswordAuth", "Command": "grep -i '^PasswordAuthentication' /etc/ssh/sshd_config", "Reference Value": "no"},
            {"Command Name": "SYS1 - CPU cores", "Command": "nproc", "Reference Value": "4"},
            {"Command Name": "SYS2 - Memory", "Command": "free -m | awk '/Mem:/ {print $2}'", "Reference Value": ">=8192"},
            {"Command Name": "NET1 - Default gateway", "Command": "ip route | grep default | awk '{print $3}'", "Reference Value": "192.168.1.1"}
        ]
        df = pd.DataFrame(sample_rows)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Template')
        output.seek(0)
        return send_file(
            output,
            as_attachment=True,
            download_name='mop_appendix_template.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    except Exception as e:
        logger.error(f"Error generating MOP template: {e}")
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
                'success': True,
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
            'success': True,
            'message': 'Server added successfully',
            'server': server,
            'total_servers': len(current_servers)
        })
        
    except Exception as e:
        logger.error(f"Error adding manual server: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

# Command routes moved to api_commands.py

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

@app.route('/api/export/execution/<int:execution_id>', methods=['GET'])
@jwt_required()
def export_execution_results(execution_id):
    """Export execution results to Excel"""
    try:
        # Get execution data
        execution = ExecutionHistory.query.get(execution_id)
        if not execution:
            return jsonify({'error': 'Execution not found'}), 404
        
        # Prepare data for export
        execution_data = {
            'mop_name': execution.mop.name if execution.mop else 'Unknown',
            'execution_type': 'Risk Assessment' if execution.risk_assessment else 'Handover Assessment',
            'executed_by': execution.user.username if execution.user else 'Unknown',
            'execution_time': execution.execution_time.isoformat(),
            'total_servers': len(set(r.server_ip for r in execution.results)),
            'total_commands': len(execution.results),
            'passed_commands': sum(1 for r in execution.results if r.is_valid),
            'failed_commands': sum(1 for r in execution.results if not r.is_valid),
            'results': []
        }
        
        # Calculate success rate and average score
        total_commands = len(execution.results)
        if total_commands > 0:
            execution_data['success_rate'] = (execution_data['passed_commands'] / total_commands) * 100
            scores = [command_validator.validate_output(r.output, r.command.reference_value, r.command.validation_type).get('score', 0) for r in execution.results]
            execution_data['average_score'] = sum(scores) / len(scores) if scores else 0
        else:
            execution_data['success_rate'] = 0
            execution_data['average_score'] = 0
        
        # Add detailed results
        for result in execution.results:
            validation_result = command_validator.validate_output(
                result.output, 
                result.command.reference_value, 
                result.command.validation_type
            )
            
            execution_data['results'].append({
                'server_ip': result.server_ip,
                'command_title': result.command.title,
                'command': result.command.command,
                'expected_output': result.command.reference_value,
                'actual_output': result.output,
                'validation_type': result.command.validation_type,
                'is_valid': result.is_valid,
                'score': validation_result.get('score', 0),
                'details': validation_result.get('details', {})
            })
        
        # Export to Excel
        filename = f"execution_{execution_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        filepath = excel_exporter.export_execution_results(execution_data, filename)
        
        return send_file(filepath, as_attachment=True, download_name=filename)
        
    except Exception as e:
        logger.error(f"Error exporting execution results: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/logs/system', methods=['GET'])
@jwt_required()
def get_system_logs():
    """Get system log files"""
    try:
        log_files = logging_system.get_log_files()
        return jsonify({'log_files': log_files})
    except Exception as e:
        logger.error(f"Error getting system logs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/logs/system/<log_type>', methods=['GET'])
@jwt_required()
def get_log_content(log_type):
    """Get log content"""
    try:
        lines = request.args.get('lines', 100, type=int)
        content = logging_system.get_log_content(log_type, lines)
        return jsonify({'content': content})
    except Exception as e:
        logger.error(f"Error getting log content: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/logs/system/<log_type>/export', methods=['GET'])
@jwt_required()
def export_system_logs(log_type):
    """Export system logs"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        filepath = logging_system.export_logs(log_type, start_date, end_date)
        filename = os.path.basename(filepath)
        
        return send_file(filepath, as_attachment=True, download_name=filename)
        
    except FileNotFoundError:
        return jsonify({'error': 'Log file not found'}), 404
    except Exception as e:
        logger.error(f"Error exporting system logs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500






















# MOP approval routes (approve, finalize, approve-final) moved to api/api_mops.py blueprint

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)