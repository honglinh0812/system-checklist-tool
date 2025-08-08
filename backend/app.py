import os
import json
import uuid
import threading
import tempfile
import shutil
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, flash, redirect, url_for, session, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import pandas as pd
from config import Config, DevelopmentConfig, ProductionConfig
from models import init_db, db
from models.user import User
from models.mop import MOP, Command, MOPFile, MOPReview
from models.execution import ExecutionHistory, ServerResult
from models.report import RiskReport
from command_validator import CommandValidator
from ansible_manager import AnsibleRunner
from excel_exporter import ExcelExporter
from logging_system import LoggingSystem

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
    CORS(app)
    init_db(app)
    
    # Start APScheduler for periodic risk assessments
    from scheduler import init_scheduler
    init_scheduler(app)
    
    try:
        logger.info(f"[BOOT] DB URI={app.config.get('SQLALCHEMY_DATABASE_URI')}")
        with app.app_context():
            from models.user import User as _DbgUser
            total_users = _DbgUser.query.count()
            logger.info(f"[BOOT] Users in DB at startup: {total_users}")
    except Exception as e:
        logger.warning(f"[BOOT] DB check failed: {e}")
    
    # Initialize login manager
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'web_login'
    login_manager.login_message = None
    
    @login_manager.unauthorized_handler
    def handle_unauthorized():
        try:
            logger.info(f"[AUTH] Unauthorized access -> path={request.path} next={request.args.get('next')} ip={request.remote_addr}")
        except Exception:
            pass
        return redirect(url_for('web_login', next=request.path))
    
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))
    
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
@login_required
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
@login_required
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
    """User login"""
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
            login_user(user)
            return jsonify({
                'message': 'Login successful',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'role': user.role
                }
            })
        else:
            return jsonify({'error': 'Invalid username or password'}), 401
            
    except Exception as e:
        logger.error(f"Error during login: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    """User logout"""
    logout_user()
    return jsonify({'message': 'Logout successful'})

@app.route('/api/auth/user', methods=['GET'])
@login_required
def get_current_user():
    """Get current user info"""
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'role': current_user.role
    })

# User Management Endpoints (Admin only)
@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    """Get all users (admin only)"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        users = User.query.all()
        return jsonify({
            'success': True,
            'users': [{
                'id': user.id,
                'username': user.username,
                'role': user.role,
                'created_at': user.created_at.isoformat()
            } for user in users]
        })
    except Exception as e:
        logger.error(f"Error getting users: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/users/<int:user_id>', methods=['GET'])
@login_required
def get_user_detail(user_id):
    """Get user details"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'success': True,
            'user': {
                'id': user.id,
                'username': user.username,
                'role': user.role,
                'created_at': user.created_at.isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting user details: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/users', methods=['POST'])
@login_required
def create_user():
    """Create new user (admin only)"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        username = data.get('username')
        password = data.get('password')
        confirm_password = data.get('confirm_password')
        role = data.get('role', 'user')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        if password != confirm_password:
            return jsonify({'error': 'Passwords do not match'}), 400
        
        if role not in ['admin', 'user']:
            return jsonify({'error': 'Invalid role. Must be admin or user'}), 400
        
        # Check if user already exists
        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            return jsonify({'error': 'Username already exists'}), 400
        
        # Create new user
        new_user = User(username=username, password=password, role=role)
        db.session.add(new_user)
        db.session.commit()
        
        return jsonify({
            'message': 'User created successfully',
            'user': {
                'id': new_user.id,
                'username': new_user.username,
                'role': new_user.role
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating user: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    """Delete user (admin only)"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if user.id == current_user.id:
            return jsonify({'error': 'Cannot delete yourself'}), 400
        
        db.session.delete(user)
        db.session.commit()
        
        return jsonify({'message': 'User deleted successfully'})
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting user: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

# MOP Management Endpoints
@app.route('/api/mops', methods=['GET'])
@login_required
def get_mops():
    """Get all MOPs"""
    try:
        mops = MOP.query.all()
        return jsonify({
            'success': True,
            'mops': [{
                'id': mop.id,
                'name': mop.name,
                'type': mop.type,
                'status': mop.status,
                'created_by': mop.created_by,
                'approved_by': mop.approved_by,
                'created_at': mop.created_at.isoformat(),
                'updated_at': mop.updated_at.isoformat(),
                'commands_count': len(mop.commands)
            } for mop in mops]
        })
    except Exception as e:
        logger.error(f"Error getting MOPs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/risk-assessment', methods=['GET'])
@login_required
def get_risk_assessment_mops():
    """Get MOPs for risk assessment"""
    try:
        # Get approved MOPs for risk assessment using ARRAY any operator
        risk_mops = MOP.query.filter(
            MOP.status == 'APPROVED',
            MOP.type.any('risk')
        ).all()
        
        mops_data = []
        for mop in risk_mops:
            mops_data.append({
                'id': mop.id,
                'name': mop.name,
                'commands_count': len(mop.commands)
            })
        
        return jsonify({
            'success': True,
            'mops': mops_data
        })
    except Exception as e:
        logger.error(f"Error getting risk assessment MOPs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/handover-assessment', methods=['GET'])
@login_required
def get_handover_assessment_mops():
    """Get MOPs for handover assessment"""
    try:
        # Get approved MOPs for handover assessment using ARRAY any operator
        handover_mops = MOP.query.filter(
            MOP.status == 'APPROVED',
            MOP.type.any('handover')
        ).all()
        
        mops_data = []
        for mop in handover_mops:
            mops_data.append({
                'id': mop.id,
                'name': mop.name,
                'commands_count': len(mop.commands)
            })
        
        return jsonify({
            'success': True,
            'mops': mops_data
        })
    except Exception as e:
        logger.error(f"Error getting handover assessment MOPs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops', methods=['POST'])
@login_required
def create_mop():
    """Create new MOP (admin only)"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        name = data.get('name')
        mop_type = data.get('type', [])
        commands = data.get('commands', [])
        
        if not name:
            return jsonify({'error': 'MOP name is required'}), 400
        
        if not isinstance(mop_type, list):
            return jsonify({'error': 'Type must be a list'}), 400
        
        # Create MOP
        mop = MOP(
            name=name,
            type=mop_type,
            status='APPROVED',
            created_by=current_user.id,
            approved_by=current_user.id
        )
        db.session.add(mop)
        db.session.flush()  # Get the ID
        
        # Add commands
        for cmd_data in commands:
            command = Command(
                mop_id=mop.id,
                title=cmd_data.get('title', ''),
                command=cmd_data.get('command', ''),
                reference_value=cmd_data.get('reference_value', '')
            )
            db.session.add(command)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'MOP created successfully',
            'mop': {
                'id': mop.id,
                'name': mop.name,
                'type': mop.type,
                'status': mop.status
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating MOP: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/<int:mop_id>', methods=['GET'])
@login_required
def get_mop_detail(mop_id):
    """Get MOP detail with commands"""
    try:
        mop = MOP.query.get(mop_id)
        if not mop:
            return jsonify({'error': 'MOP not found'}), 404
        
        return jsonify({
            'success': True,
            'mop': {
                'id': mop.id,
                'name': mop.name,
                'type': mop.type,
                'status': mop.status,
                'created_by': mop.created_by,
                'approved_by': mop.approved_by,
                'created_at': mop.created_at.isoformat(),
                'updated_at': mop.updated_at.isoformat(),
                'files': [{
                    'id': f.id,
                    'file_type': f.file_type,
                    'file_path': f.file_path,
                    'uploaded_at': f.uploaded_at.isoformat()
                } for f in mop.files],
                'commands': [{
                    'id': cmd.id,
                    'title': cmd.title,
                    'command': cmd.command,
                    'reference_value': cmd.reference_value
                } for cmd in mop.commands]
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting MOP detail: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/<int:mop_id>/files/<file_type>', methods=['GET'])
@login_required
def download_mop_file(mop_id, file_type):
    """Download MOP file (pdf or appendix)"""
    try:
        mop = MOP.query.get(mop_id)
        if not mop:
            return jsonify({'error': 'MOP not found'}), 404
            
        # Find the requested file
        mop_file = None
        for f in mop.files:
            if f.file_type == file_type:
                mop_file = f
                break
                
        if not mop_file:
            return jsonify({'error': f'No {file_type} file found for this MOP'}), 404
            
        if not os.path.exists(mop_file.file_path):
            return jsonify({'error': 'File not found on server'}), 404
            
        return send_file(mop_file.file_path, as_attachment=True, download_name=os.path.basename(mop_file.file_path))
        
    except Exception as e:
        logger.error(f"Error downloading MOP file: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/<int:mop_id>', methods=['PUT'])
@login_required
def update_mop(mop_id):
    """Update MOP (admin only)"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        mop = MOP.query.get(mop_id)
        if not mop:
            return jsonify({'error': 'MOP not found'}), 404
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Update MOP fields
        if 'name' in data:
            mop.name = data['name']
        if 'type' in data:
            mop.type = data['type']
        
        # Update commands if provided
        if 'commands' in data:
            # Delete existing commands
            for cmd in mop.commands:
                db.session.delete(cmd)
            
            # Add new commands
            for cmd_data in data['commands']:
                command = Command(
                    mop_id=mop.id,
                    title=cmd_data.get('title', ''),
                    command=cmd_data.get('command', ''),
                    reference_value=cmd_data.get('reference_value', '')
                )
                db.session.add(command)
        
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'MOP updated successfully'})
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating MOP: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/<int:mop_id>', methods=['DELETE'])
@login_required
def delete_mop(mop_id):
    """Delete MOP (admin only)"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        mop = MOP.query.get(mop_id)
        if not mop:
            return jsonify({'error': 'MOP not found'}), 404
        
        db.session.delete(mop)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'MOP deleted successfully'})
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting MOP: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

# MOP File Upload and Review Endpoints
@app.route('/api/mops/upload', methods=['POST'])
@login_required
def upload_mop_files():
    """Upload MOP PDF and appendix files"""
    try:
        if 'pdf_file' not in request.files or 'appendix_file' not in request.files:
            return jsonify({'error': 'Both PDF and appendix files are required'}), 400
        
        pdf_file = request.files['pdf_file']
        appendix_file = request.files['appendix_file']
        
        if pdf_file.filename == '' or appendix_file.filename == '':
            return jsonify({'error': 'Both files must be selected'}), 400
        
        # Validate file extensions
        if not pdf_file.filename.lower().endswith('.pdf'):
            return jsonify({'error': 'PDF file must have .pdf extension'}), 400
        
        appendix_ext = appendix_file.filename.rsplit('.', 1)[1].lower()
        if appendix_ext not in ['xlsx', 'xls', 'csv']:
            return jsonify({'error': 'Appendix file must be Excel or CSV'}), 400
        
        # Save files
        pdf_filename = secure_filename(f"mop_pdf_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf")
        appendix_filename = secure_filename(f"mop_appendix_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{appendix_ext}")
        
        pdf_path = os.path.join(app.config['UPLOAD_FOLDER'], 'pdf', pdf_filename)
        appendix_path = os.path.join(app.config['UPLOAD_FOLDER'], 'appendix', appendix_filename)
        
        pdf_file.save(pdf_path)
        appendix_file.save(appendix_path)
        
        # Extract commands from appendix file
        commands = []
        try:
            if appendix_ext in ['xlsx', 'xls']:
                df = pd.read_excel(appendix_path)
            else:
                df = pd.read_csv(appendix_path)
            
            # Check if file has at least 3 columns
            if len(df.columns) < 3:
                return jsonify({'error': 'Appendix file must have at least 3 columns: Command Name, Command, Reference Value'}), 400
            
            # Extract commands from first 3 columns
            for index, row in df.iterrows():
                if len(row) >= 3 and pd.notna(row[0]) and pd.notna(row[1]) and pd.notna(row[2]):
                    commands.append({
                        'title': str(row[0]).strip(),
                        'command': str(row[1]).strip(),
                        'reference_value': str(row[2]).strip()
                    })
            
            if not commands:
                return jsonify({'error': 'No valid commands found in appendix file'}), 400
                
        except Exception as e:
            logger.error(f"Error reading appendix file: {str(e)}")
            return jsonify({'error': 'Error reading appendix file. Please check the file format.'}), 400
        
        # Create MOP with PENDING_APPROVAL status
        mop = MOP(
            name=f"MOP_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            type=[],
            status='PENDING_APPROVAL',
            created_by=current_user.id
        )
        db.session.add(mop)
        db.session.flush()
        
        # Create MOP files
        pdf_mop_file = MOPFile(
            mop_id=mop.id,
            file_type='pdf',
            file_path=pdf_path
        )
        appendix_mop_file = MOPFile(
            mop_id=mop.id,
            file_type='appendix',
            file_path=appendix_path
        )
        
        db.session.add(pdf_mop_file)
        db.session.add(appendix_mop_file)
        
        # Add commands to MOP
        for cmd_data in commands:
            command = Command(
                mop_id=mop.id,
                title=cmd_data['title'],
                command=cmd_data['command'],
                reference_value=cmd_data['reference_value']
            )
            db.session.add(command)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'MOP files uploaded successfully',
            'mop_id': mop.id,
            'status': 'PENDING_APPROVAL',
            'commands_count': len(commands)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error uploading MOP files: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/<int:mop_id>/review', methods=['POST'])
@login_required
def review_mop(mop_id):
    """Review MOP (approve/reject) - admin only"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        mop = MOP.query.get(mop_id)
        if not mop:
            return jsonify({'error': 'MOP not found'}), 404
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        action = data.get('action')  # 'approve' or 'reject'
        reject_reason = data.get('reject_reason', '')
        
        if action not in ['approve', 'reject']:
            return jsonify({'error': 'Action must be approve or reject'}), 400
        
        if action == 'reject' and not reject_reason:
            return jsonify({'error': 'Reject reason is required'}), 400
        
        # Create review record
        review = MOPReview(
            mop_id=mop.id,
            admin_id=current_user.id,
            status='APPROVED' if action == 'approve' else 'REJECTED',
            reject_reason=reject_reason if action == 'reject' else None
        )
        db.session.add(review)
        
        # Update MOP status
        if action == 'approve':
            mop.status = 'APPROVED'
            mop.approved_by = current_user.id
        else:
            mop.status = 'REJECTED'
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'MOP {action}d successfully',
            'status': mop.status
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error reviewing MOP: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/pending', methods=['GET'])
@login_required
def get_pending_mops():
    """Get pending MOPs for review (admin only)"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        pending_mops = MOP.query.filter_by(status='PENDING_APPROVAL').all()
        return jsonify({
            'success': True,
            'mops': [{
                'id': mop.id,
                'name': mop.name,
                'created_by': mop.created_by,
                'created_at': mop.created_at.isoformat(),
                'files': [{
                    'id': file.id,
                    'file_type': file.file_type,
                    'uploaded_at': file.uploaded_at.isoformat()
                } for file in mop.files]
            } for mop in pending_mops]
        })
        
    except Exception as e:
        logger.error(f"Error getting pending MOPs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

# Server Connection Test Endpoint
@app.route('/api/servers/test-connection', methods=['POST'])
@login_required
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
@login_required
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

# Execution History Endpoints
@app.route('/api/executions', methods=['GET'])
@login_required
def get_execution_history():
    """Get execution history for the last 7 days"""
    try:
        from datetime import timedelta
        from models.execution import ExecutionHistory
        
        # Get executions from last 7 days
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        executions = ExecutionHistory.query.filter(
            ExecutionHistory.execution_time >= seven_days_ago
        ).order_by(ExecutionHistory.execution_time.desc()).all()
        
        execution_list = []
        for exec in executions:
            # Calculate results summary
            total_commands = len(exec.results)
            passed_commands = sum(1 for r in exec.results if r.is_valid)
            failed_commands = total_commands - passed_commands
            success_rate = (passed_commands / total_commands * 100) if total_commands > 0 else 0
            
            # Determine assessment type
            assessment_type = "Đánh giá rủi ro" if exec.risk_assessment else "Đánh giá bàn giao"
            
            # Get user info
            user_name = exec.user.username if exec.user else 'Unknown'
            
            execution_data = {
                'id': exec.id,
                'mop_id': exec.mop_id,
                'user_id': exec.user_id,
                'user_name': user_name,
                'execution_time': exec.execution_time.isoformat(),
                'execution_time_formatted': exec.execution_time.strftime('%Y-%m-%d %H:%M:%S'),
                'risk_assessment': exec.risk_assessment,
                'handover_assessment': exec.handover_assessment,
                'assessment_type': assessment_type,
                'server_count': len(set(r.server_ip for r in exec.results)),
                'total_commands': total_commands,
                'passed_commands': passed_commands,
                'failed_commands': failed_commands,
                'success_rate': success_rate,
                'mop_name': exec.mop.name if exec.mop else 'Unknown MOP',
                'status': 'Success' if success_rate == 100 else 'Partial' if success_rate > 0 else 'Failed'
            }
            execution_list.append(execution_data)
        
        return jsonify({
            'success': True,
            'executions': execution_list
        })
        
    except Exception as e:
        logger.error(f"Error getting execution history: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/executions/<int:execution_id>', methods=['GET'])
@login_required
def get_execution_detail(execution_id):
    """Get detailed execution information"""
    try:
        from models.execution import ExecutionHistory
        
        execution = ExecutionHistory.query.get(execution_id)
        if not execution:
            return jsonify({'error': 'Execution not found'}), 404
        
        # Group results by server
        server_results = {}
        for result in execution.results:
            if result.server_ip not in server_results:
                server_results[result.server_ip] = []
            server_results[result.server_ip].append({
                'id': result.id,
                'command_id': result.command_id,
                'output': result.output,
                'stderr': result.stderr,
                'return_code': result.return_code,
                'is_valid': result.is_valid,
                'command': result.command
            })
        
        return jsonify({
            'success': True,
            'execution': {
                'id': execution.id,
                'mop_id': execution.mop_id,
                'user_id': execution.user_id,
                'execution_time': execution.execution_time.isoformat(),
                'risk_assessment': execution.risk_assessment,
                'handover_assessment': execution.handover_assessment,
                'mop': {
                    'id': execution.mop.id,
                    'name': execution.mop.name,
                    'commands': [{
                        'id': cmd.id,
                        'title': cmd.title,
                        'command': cmd.command,
                        'reference_value': cmd.reference_value
                    } for cmd in execution.mop.commands]
                },
                'user': {
                    'id': execution.user.id,
                    'username': execution.user.username
                },
                'results': [{
                    'server_ip': server_ip,
                    'commands': results
                } for server_ip, results in server_results.items()]
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting execution detail: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

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
@login_required
def run_commands():
    """Run commands on selected servers"""
    global current_servers, current_commands
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        selected_servers = data.get('selected_servers', [])
        commands = data.get('commands', [])
        mop_id = data.get('mop_id')  # Optional MOP ID
        
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
        
        # Create execution history record
        from models.execution import ExecutionHistory
        execution = ExecutionHistory(
            mop_id=mop_id,
            user_id=current_user.id,
            risk_assessment=data.get('risk_assessment', False),
            handover_assessment=data.get('handover_assessment', False)
        )
        db.session.add(execution)
        db.session.flush()  # Get the ID
        
        # Run commands in background
        import threading
        thread = threading.Thread(
            target=ansible_runner.run_playbook,
            args=(job_id, commands, servers_to_run, timestamp, execution.id)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Commands started successfully',
            'job_id': job_id,
            'execution_id': execution.id,
            'servers_count': len(servers_to_run),
            'commands_count': len(commands)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running commands: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/commands/status/<job_id>', methods=['GET'])
def get_command_status(job_id):
    """Get status of command execution"""
    try:
        status = ansible_runner.get_job_status(job_id)
        if status:
            return jsonify({
            'success': True,
            'status': status
        })
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
            return jsonify({
            'success': True,
            'results': results
        })
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
            return jsonify({
            'success': True,
            'logs': logs
        })
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

@app.route('/api/export/execution/<int:execution_id>', methods=['GET'])
@login_required
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
@login_required
def get_system_logs():
    """Get system log files"""
    try:
        log_files = logging_system.get_log_files()
        return jsonify({'log_files': log_files})
    except Exception as e:
        logger.error(f"Error getting system logs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/logs/system/<log_type>', methods=['GET'])
@login_required
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
@login_required
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

# Web Interface Routes
@app.route('/')
@login_required
def dashboard():
    """Dashboard page"""
    try:
        # Get statistics
        from models.mop import MOP
        from models.execution import ExecutionHistory
        from datetime import timedelta
        
        total_mops = MOP.query.count()
        approved_mops = MOP.query.filter_by(status='APPROVED').count()
        pending_mops = MOP.query.filter_by(status='PENDING_APPROVAL').count()
        
        # Get recent executions (last 7 days)
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_executions = ExecutionHistory.query.filter(
            ExecutionHistory.execution_time >= seven_days_ago
        ).count()
        
        stats = {
            'total_mops': total_mops,
            'approved_mops': approved_mops,
            'pending_mops': pending_mops,
            'recent_executions': recent_executions
        }
        
        # Get recent data for admin
        recent_mops = []
        recent_executions_list = []
        
        if current_user.is_admin():
            recent_mops = MOP.query.order_by(MOP.created_at.desc()).limit(5).all()
            recent_executions_list = ExecutionHistory.query.order_by(
                ExecutionHistory.execution_time.desc()
            ).limit(5).all()
        
        return render_template('dashboard.html', 
                            stats=stats, 
                            recent_mops=recent_mops,
                            recent_executions=recent_executions_list)
        
    except Exception as e:
        logger.error(f"Error loading dashboard: {str(e)}")
        flash('Error loading dashboard', 'error')
        return render_template('dashboard.html', stats={}, recent_mops=[], recent_executions=[])

@app.route('/login', methods=['GET', 'POST'])
def web_login():
    """Login page"""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        next_url = request.args.get('next') or url_for('dashboard')
        logger.info(f"[AUTH] Login attempt user={username} next={next_url} ip={request.remote_addr}")
        try:
            logger.info(f"[AUTH] DB URI={app.config.get('SQLALCHEMY_DATABASE_URI')}")
            from models.user import User as _DbgUser
            logger.info(f"[AUTH] user_count={_DbgUser.query.count()}")
        except Exception as e:
            logger.warning(f"[AUTH] DB introspection failed: {e}")
        
        if not username or not password:
            flash('Username and password are required', 'error')
            return render_template('auth/login.html')
        
        user = User.query.filter_by(username=username).first()
        logger.info(f"[AUTH] user_exists={bool(user)}")
        if user:
            ok = user.check_password(password)
            logger.info(f"[AUTH] password_ok={ok}")
        else:
            ok = False
        if ok:
            login_user(user)
            logger.info(f"[AUTH] Login success user={username}")
            return redirect(next_url)
        else:
            logger.warning(f"[AUTH] Login failed user={username}")
            flash('Invalid username or password', 'error')
    
    return render_template('auth/login.html')

@app.route('/logout')
@login_required
def web_logout():
    """Logout"""
    logout_user()
    flash('You have been logged out', 'info')
    return redirect(url_for('web_login'))

@app.route('/risk-assessment')
@login_required
def risk_assessment():
    """Risk assessment page"""
    try:
        from models.mop import MOP
        # Get approved MOPs for risk assessment (ARRAY any operator)
        risk_mops = MOP.query.filter(
            MOP.status == 'APPROVED',
            MOP.type.any('risk')
        ).all()
        
        return render_template('risk_assessment.html', mops=risk_mops)
        
    except Exception as e:
        logger.error(f"Error loading risk assessment: {str(e)}")
        flash('Error loading risk assessment', 'error')
        return render_template('risk_assessment.html', mops=[])

@app.route('/handover-assessment')
@login_required
def handover_assessment():
    """Handover assessment page"""
    try:
        from models.mop import MOP
        # Get approved MOPs for handover assessment (ARRAY any operator)
        handover_mops = MOP.query.filter(
            MOP.status == 'APPROVED',
            MOP.type.any('handover')
        ).all()
        
        return render_template('handover_assessment.html', mops=handover_mops)
        
    except Exception as e:
        logger.error(f"Error loading handover assessment: {str(e)}")
        flash('Error loading handover assessment', 'error')
        return render_template('handover_assessment.html', mops=[])

@app.route('/mop-management')
@login_required
def mop_management():
    """MOP management page (admin only)"""
    if not current_user.is_admin():
        flash('Admin access required', 'error')
        return redirect(url_for('dashboard'))
    
    try:
        from models.mop import MOP
        mops = MOP.query.order_by(MOP.created_at.desc()).all()
        return render_template('mop_management.html', mops=mops)
        
    except Exception as e:
        logger.error(f"Error loading MOP management: {str(e)}")
        flash('Error loading MOP management', 'error')
        return render_template('mop_management.html', mops=[])

@app.route('/user-management')
@login_required
def user_management():
    """User management page (admin only)"""
    if not current_user.is_admin():
        flash('Admin access required', 'error')
        return redirect(url_for('dashboard'))
    
    try:
        users = User.query.order_by(User.created_at.desc()).all()
        return render_template('user_management.html', users=users)
        
    except Exception as e:
        logger.error(f"Error loading user management: {str(e)}")
        flash('Error loading user management', 'error')
        return render_template('user_management.html', users=[])

@app.route('/execution-history')
@login_required
def execution_history():
    """Execution history page"""
    try:
        from models.execution import ExecutionHistory
        from datetime import timedelta
        
        # Get executions from last 7 days
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        executions = ExecutionHistory.query.filter(
            ExecutionHistory.execution_time >= seven_days_ago
        ).order_by(ExecutionHistory.execution_time.desc()).all()
        
        return render_template('execution_history.html', executions=executions)
        
    except Exception as e:
        logger.error(f"Error loading execution history: {str(e)}")
        flash('Error loading execution history', 'error')
        return render_template('execution_history.html', executions=[])

@app.route('/mop-submission')
@login_required
def mop_submission():
    """MOP submission page for users"""
    try:
        return render_template('mop_submission.html')
    except Exception as e:
        logger.error(f"Error loading MOP submission: {str(e)}")
        flash('Error loading MOP submission', 'error')
        return render_template('mop_submission.html')

@app.route('/mop-review')
@login_required
def mop_review():
    """MOP review page for admins"""
    if not current_user.is_admin():
        flash('Admin access required', 'error')
        return redirect(url_for('dashboard'))
    
    try:
        from models.mop import MOP
        pending_mops = MOP.query.filter_by(status='PENDING_APPROVAL').all()
        return render_template('mop_review.html', pending_mops=pending_mops)
    except Exception as e:
        logger.error(f"Error loading MOP review: {str(e)}")
        flash('Error loading MOP review', 'error')
        return render_template('mop_review.html', pending_mops=[])

@app.route('/mop-edit/<int:mop_id>')
@login_required
def mop_edit(mop_id):
    """MOP editing page for admins"""
    if not current_user.is_admin():
        flash('Admin access required', 'error')
        return redirect(url_for('dashboard'))
    
    try:
        from models.mop import MOP
        mop = MOP.query.get(mop_id)
        if not mop:
            flash('MOP not found', 'error')
            return redirect(url_for('mop_review'))
        
        return render_template('mop_edit.html', mop=mop)
    except Exception as e:
        logger.error(f"Error loading MOP edit: {str(e)}")
        flash('Error loading MOP edit', 'error')
        return redirect(url_for('mop_review'))

@app.route('/api/mops/<int:mop_id>/approve', methods=['POST'])
@login_required
def approve_mop_for_edit(mop_id):
    """Approve MOP and move to edit page"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
    
    try:
        mop = MOP.query.get(mop_id)
        if not mop:
            return jsonify({'error': 'MOP not found'}), 404
        
        if mop.status != 'PENDING_APPROVAL':
            return jsonify({'error': 'MOP is not pending approval'}), 400
        
        # Update MOP status to APPROVED_FOR_EDIT
        mop.status = 'APPROVED_FOR_EDIT'
        mop.approved_by = current_user.id
        
        # Create review record
        review = MOPReview(
            mop_id=mop.id,
            admin_id=current_user.id,
            status='APPROVED_FOR_EDIT'
        )
        db.session.add(review)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'MOP approved for editing',
            'edit_url': f'/mop-edit/{mop.id}'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error approving MOP: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/mops/<int:mop_id>/finalize', methods=['POST'])
@login_required
def finalize_mop(mop_id):
    """Finalize MOP after editing"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        data = request.get_json()
        mop = MOP.query.get(mop_id)
        if not mop:
            return jsonify({'error': 'MOP not found'}), 404
        
        if mop.status != 'APPROVED_FOR_EDIT':
            return jsonify({'error': 'MOP is not approved for editing'}), 400
        
        # Update MOP with final data
        mop.name = data.get('name', mop.name)
        mop.type = data.get('type', [])
        mop.status = 'PENDING_APPROVAL'  # Change status to PENDING_APPROVAL instead of APPROVED
        mop.updated_at = datetime.utcnow()
        
        # Update commands
        commands_data = data.get('commands', [])
        
        # Remove existing commands
        Command.query.filter_by(mop_id=mop.id).delete()
        
        # Add new commands
        for cmd_data in commands_data:
            command = Command(
                mop_id=mop.id,
                title=cmd_data['title'],
                command=cmd_data['command'],
                reference_value=cmd_data['reference_value']
            )
            db.session.add(command)
        
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error finalizing MOP: {e}")
        return jsonify({'error': 'Internal error'}), 500

@app.route('/api/mops/<int:mop_id>/approve-final', methods=['POST'])
@login_required
def approve_mop_final(mop_id):
    """Approve MOP after final editing"""
    if not current_user.is_admin():
        return jsonify({'error': 'Admin access required'}), 403
        
    try:
        data = request.get_json()
        mop = MOP.query.get(mop_id)
        if not mop:
            return jsonify({'error': 'MOP not found'}), 404
        
        if mop.status != 'APPROVED_FOR_EDIT':
            return jsonify({'error': 'MOP is not approved for editing'}), 400
        
        # Update MOP with final data
        mop.name = data.get('name', mop.name)
        mop.type = data.get('type', [])
        mop.status = 'APPROVED'  # Change status to APPROVED
        mop.updated_at = datetime.utcnow()
        
        # Update commands
        commands_data = data.get('commands', [])
        
        # Remove existing commands
        Command.query.filter_by(mop_id=mop.id).delete()
        
        # Add new commands
        for cmd_data in commands_data:
            command = Command(
                mop_id=mop.id,
                title=cmd_data['title'],
                command=cmd_data['command'],
                reference_value=cmd_data['reference_value']
            )
            db.session.add(command)
        
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error approving MOP: {e}")
        return jsonify({'error': 'Internal error'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)