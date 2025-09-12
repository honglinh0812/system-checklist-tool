from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import desc, asc
from models import db
from models.server import Server
from models.user import User
from api.api_utils import api_response, api_error, paginate_query, validate_json, get_request_filters, admin_required
from core.auth import get_current_user
from datetime import datetime, timezone, timedelta
import logging

# GMT+7 timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))

logger = logging.getLogger(__name__)

servers_bp = Blueprint('servers', __name__, url_prefix='/api/servers')

@servers_bp.route('', methods=['GET'])
@jwt_required()
def get_servers():
    """Get list of saved servers"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get filter parameters
        filters = get_request_filters()
        
        # Build query
        query = Server.query.filter_by(is_active=True)
        
        # Apply search filter
        if filters.get('search'):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                db.or_(
                    Server.name.ilike(search_term),
                    Server.ip.ilike(search_term),
                    Server.description.ilike(search_term)
                )
            )
        
        # Apply sorting
        sort_by = filters.get('sort_by', 'created_at')
        sort_order = filters.get('sort_order', 'desc')
        
        if hasattr(Server, sort_by):
            if sort_order == 'desc':
                query = query.order_by(desc(getattr(Server, sort_by)))
            else:
                query = query.order_by(asc(getattr(Server, sort_by)))
        else:
            query = query.order_by(desc(Server.created_at))
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        
        # Apply pagination
        pagination = query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        # Use full dict for servers that will be used for connections
        # Note: This includes passwords, so ensure proper access control
        servers = [server.to_dict() for server in pagination.items]
        
        return api_response({
            'servers': servers,
            'pagination': {
                'page': pagination.page,
                'pages': pagination.pages,
                'per_page': pagination.per_page,
                'total': pagination.total,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting servers: {str(e)}")
        return api_error('Internal server error', 500)

@servers_bp.route('', methods=['POST'])
@jwt_required()
def create_server():
    """Create a new server"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json()
        if not data:
            return api_error('No data provided', 400)
        
        # Validate required fields
        required_fields = ['ip', 'admin_username', 'admin_password', 'root_username', 'root_password']
        for field in required_fields:
            if not data.get(field):
                return api_error(f'{field} is required', 400)
        
        # Check if server with this IP already exists
        existing_server = Server.query.filter_by(ip=data['ip'], is_active=True).first()
        if existing_server:
            return api_error('Server with this IP already exists', 409)
        
        # Create new server
        server = Server(
            name=data.get('name'),
            ip=data['ip'],
            ssh_port=data.get('ssh_port', 22),
            admin_username=data['admin_username'],
            admin_password=data['admin_password'],
            root_username=data['root_username'],
            root_password=data['root_password'],
            description=data.get('description'),
            created_by=current_user.id
        )
        
        db.session.add(server)
        db.session.commit()
        
        logger.info(f"Server {server.ip} created by user {current_user.username}")
        
        return api_response({
            'message': 'Server created successfully',
            'server': server.to_dict_safe()
        }, 201)
        
    except ValueError as e:
        return api_error(str(e), 400)
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating server: {str(e)}")
        return api_error('Internal server error', 500)

@servers_bp.route('/<int:server_id>', methods=['GET'])
@jwt_required()
def get_server(server_id):
    """Get server details"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        server = Server.query.filter_by(id=server_id, is_active=True).first()
        if not server:
            return api_error('Server not found', 404)
        
        return api_response({
            'server': server.to_dict_safe()
        })
        
    except Exception as e:
        logger.error(f"Error getting server {server_id}: {str(e)}")
        return api_error('Internal server error', 500)

@servers_bp.route('/<int:server_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_server(server_id):
    """Update server information"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        server = Server.query.filter_by(id=server_id, is_active=True).first()
        if not server:
            return api_error('Server not found', 404)
        
        # Admin access already checked by decorator
        
        data = request.get_json()
        if not data:
            return api_error('No data provided', 400)
        
        # Update fields
        if 'name' in data:
            server.name = data['name']
        if 'ip' in data:
            # Check if new IP conflicts with existing servers
            if data['ip'] != server.ip:
                existing_server = Server.query.filter_by(ip=data['ip'], is_active=True).first()
                if existing_server:
                    return api_error('Server with this IP already exists', 409)
            server.ip = data['ip']
        if 'ssh_port' in data:
            server.ssh_port = data['ssh_port']
        if 'admin_username' in data:
            server.admin_username = data['admin_username']
        if 'admin_password' in data:
            server.admin_password = data['admin_password']
        if 'root_username' in data:
            server.root_username = data['root_username']
        if 'root_password' in data:
            server.root_password = data['root_password']
        if 'description' in data:
            server.description = data['description']
        
        db.session.commit()
        
        logger.info(f"Server {server.ip} updated by user {current_user.username}")
        
        return api_response({
            'message': 'Server updated successfully',
            'server': server.to_dict_safe()
        })
        
    except ValueError as e:
        return api_error(str(e), 400)
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating server {server_id}: {str(e)}")
        return api_error('Internal server error', 500)

@servers_bp.route('/<int:server_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_server(server_id):
    """Delete server (soft delete)"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        server = Server.query.filter_by(id=server_id, is_active=True).first()
        if not server:
            return api_error('Server not found', 404)
        
        # Admin access already checked by decorator
        
        # Soft delete
        server.is_active = False
        db.session.commit()
        
        logger.info(f"Server {server.ip} deleted by user {current_user.username}")
        
        return api_response({
            'message': 'Server deleted successfully'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting server {server_id}: {str(e)}")
        return api_error('Internal server error', 500)

@servers_bp.route('/test-connection', methods=['POST'])
@jwt_required()
def test_server_connection():
    """Test connection to a server"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json()
        if not data:
            return api_error('No data provided', 400)
        
        # Validate required fields
        required_fields = ['ip', 'admin_username', 'admin_password', 'root_username', 'root_password']
        for field in required_fields:
            if not data.get(field):
                return api_error(f'{field} is required', 400)
        
        # Test connection using existing logic from app.py
        from services.ansible_manager import AnsibleRunner
        
        ansible_runner = AnsibleRunner()
        
        # Create test server object with proper field mapping
        test_server = {
            'serverIP': data['ip'],
            'sshPort': str(data.get('ssh_port', 22)),  # Convert to string for ansible, default to 22
            'sshUser': data['admin_username'],
            'sshPassword': data['admin_password'],
            'sudoUser': data['root_username'],
            'sudoPassword': data['root_password']
        }
        
        # Test with simple command
        test_commands = [{
            'title': 'Connection Test',
            'command': 'echo "Connection test successful"',
            'reference_value': 'Connection test successful'
        }]
        
        # Run test using run_playbook method
        import uuid
        job_id = f"test_connection_{uuid.uuid4().hex[:8]}"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        ansible_runner.run_playbook(job_id, test_commands, [test_server], timestamp)
        
        # Wait for result (short timeout for connection test)
        import time
        max_wait = 30  # 30 seconds timeout
        wait_time = 0
        
        while wait_time < max_wait:
            status = ansible_runner.get_job_status(job_id)
            if status and status.get('status') in ['completed', 'failed']:
                break
            time.sleep(1)
            wait_time += 1
        
        # Get final status
        final_status = ansible_runner.get_job_status(job_id)
        
        if final_status and final_status.get('status') == 'completed':
            return api_response({
                'success': True,
                'message': 'Connection test successful',
                'ssh_test': True,
                'sudo_test': True
            })
        else:
            return api_response({
                'success': False,
                'message': 'Connection test failed',
                'ssh_test': False,
                'sudo_test': False
            })
        
    except Exception as e:
        logger.error(f"Error testing server connection: {str(e)}")
        return api_error('Connection test failed', 500)

@servers_bp.route('/bulk-save', methods=['POST'])
@jwt_required()
def bulk_save_servers():
    """Save multiple servers from current session"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        data = request.get_json()
        if not data or 'servers' not in data:
            return api_error('Server list is required', 400)
        
        servers_data = data['servers']
        if not isinstance(servers_data, list):
            return api_error('Servers must be a list', 400)
        
        saved_servers = []
        errors = []
        
        for i, server_data in enumerate(servers_data):
            try:
                # Validate required fields
                required_fields = ['ip', 'admin_username', 'admin_password', 'root_username', 'root_password']
                for field in required_fields:
                    if not server_data.get(field):
                        errors.append(f"Server {i+1}: {field} is required")
                        continue
                
                # Check if server with this IP already exists
                existing_server = Server.query.filter_by(ip=server_data['ip']).first()
                
                if existing_server:
                    # Update existing server instead of creating new one
                    existing_server.name = server_data.get('name') or f"Server {server_data['ip']}"
                    existing_server.ssh_port = server_data.get('ssh_port', 22)
                    existing_server.admin_username = server_data['admin_username']
                    existing_server.admin_password = server_data['admin_password']
                    existing_server.root_username = server_data['root_username']
                    existing_server.root_password = server_data['root_password']
                    existing_server.description = server_data.get('description', f"Updated - {datetime.now().strftime('%d/%m/%Y')}")
                    existing_server.updated_at = datetime.now(GMT_PLUS_7)
                    existing_server.is_active = True
                    
                    saved_servers.append(existing_server)
                    logger.info(f"Updated existing server {server_data['ip']}")
                else:
                    # Create new server
                    server = Server(
                        name=server_data.get('name') or f"Server {server_data['ip']}",
                        ip=server_data['ip'],
                        ssh_port=server_data.get('ssh_port', 22),
                        admin_username=server_data['admin_username'],
                        admin_password=server_data['admin_password'],
                        root_username=server_data['root_username'],
                        root_password=server_data['root_password'],
                        description=server_data.get('description'),
                        created_by=current_user.id
                    )
                    
                    db.session.add(server)
                    saved_servers.append(server)
                    logger.info(f"Created new server {server_data['ip']}")
                
            except ValueError as e:
                errors.append(f"Server {i+1}: {str(e)}")
            except Exception as e:
                errors.append(f"Server {i+1}: Unexpected error - {str(e)}")
        
        if saved_servers:
            db.session.commit()
            logger.info(f"{len(saved_servers)} servers saved by user {current_user.username}")
        
        # Return response directly without wrapping in api_response 
        # because frontend expects this specific format
        response_data = {
            'success': True,
            'message': f'Successfully saved {len(saved_servers)} servers',
            'saved_count': len(saved_servers),
            'error_count': len(errors),
            'errors': errors,
            'servers': [server.to_dict_safe() for server in saved_servers]
        }
        return jsonify(response_data), 200
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error bulk saving servers: {str(e)}")
        return api_error('Internal server error', 500)