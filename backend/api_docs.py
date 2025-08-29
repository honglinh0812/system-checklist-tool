from flask import Flask
from flask_restx import Api, Resource, fields, Namespace
from flask_jwt_extended import jwt_required
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def handle_api_response(response):
    """Helper function to handle API responses for Flask-RESTX compatibility"""
    if isinstance(response, tuple):
        # If response is a tuple (data, status_code), extract the data
        data, status_code = response
        if hasattr(data, 'get_json'):
            # If data is a Flask Response object, get its JSON content
            return data.get_json(), status_code
        return data, status_code
    return response

def init_api_docs(app):
    """Initialize Flask-RESTX API documentation"""
    
    # Configure API documentation
    api = Api(
        app,
        version='1.0',
        title='System Checklist Tool API',
        description='API documentation for System Checklist Tool - MOP execution and assessment system',
        doc='/api/docs/',
        prefix='/api',
        validate=True
    )
    
    # Define common models for documentation
    
    # User models
    user_model = api.model('User', {
        'id': fields.Integer(required=True, description='User ID'),
        'username': fields.String(required=True, description='Username'),
        'email': fields.String(required=True, description='Email address'),
        'role': fields.String(required=True, description='User role (admin, user, viewer)'),
        'is_active': fields.Boolean(required=True, description='User active status'),
        'created_at': fields.DateTime(description='Creation timestamp'),
        'updated_at': fields.DateTime(description='Last update timestamp')
    })
    
    login_model = api.model('Login', {
        'username': fields.String(required=True, description='Username'),
        'password': fields.String(required=True, description='Password')
    })
    
    token_response = api.model('TokenResponse', {
        'access_token': fields.String(required=True, description='JWT access token'),
        'refresh_token': fields.String(required=True, description='JWT refresh token'),
        'user': fields.Nested(user_model, description='User information')
    })
    
    # MOP models
    mop_model = api.model('MOP', {
        'id': fields.Integer(required=True, description='MOP ID'),
        'name': fields.String(required=True, description='MOP name'),
        'type': fields.String(required=True, description='MOP type (risk, handover)'),
        'description': fields.String(description='MOP description'),
        'status': fields.String(required=True, description='MOP status'),
        'created_by': fields.Integer(description='Creator user ID'),
        'created_at': fields.DateTime(description='Creation timestamp'),
        'updated_at': fields.DateTime(description='Last update timestamp')
    })
    
    # Server models
    server_model = api.model('Server', {
        'hostname': fields.String(required=True, description='Server hostname'),
        'ip_address': fields.String(required=True, description='Server IP address'),
        'username': fields.String(required=True, description='SSH username'),
        'password': fields.String(required=True, description='SSH password'),
        'port': fields.Integer(description='SSH port (default: 22)')
    })
    
    # Execution models
    execution_model = api.model('Execution', {
        'id': fields.Integer(required=True, description='Execution ID'),
        'mop_id': fields.Integer(required=True, description='MOP ID'),
        'assessment_type': fields.String(required=True, description='Assessment type'),
        'status': fields.String(required=True, description='Execution status'),
        'total_servers': fields.Integer(description='Total number of servers'),
        'successful_servers': fields.Integer(description='Number of successful servers'),
        'failed_servers': fields.Integer(description='Number of failed servers'),
        'created_at': fields.DateTime(description='Creation timestamp'),
        'completed_at': fields.DateTime(description='Completion timestamp')
    })
    
    # Periodic Assessment models
    periodic_assessment_model = api.model('PeriodicAssessment', {
        'id': fields.Integer(required=True, description='Periodic Assessment ID'),
        'mop_id': fields.Integer(required=True, description='MOP ID'),
        'assessment_type': fields.String(required=True, description='Assessment type'),
        'frequency': fields.String(required=True, description='Execution frequency'),
        'execution_time': fields.String(required=True, description='Execution time'),
        'status': fields.String(required=True, description='Status (active, paused, inactive)'),
        'next_execution': fields.DateTime(description='Next execution time'),
        'created_at': fields.DateTime(description='Creation timestamp')
    })
    
    # Response models
    api_response_model = api.model('ApiResponse', {
        'success': fields.Boolean(required=True, description='Request success status'),
        'message': fields.String(description='Response message'),
        'data': fields.Raw(description='Response data')
    })
    
    error_response_model = api.model('ErrorResponse', {
        'success': fields.Boolean(required=True, description='Request success status (always false)'),
        'message': fields.String(required=True, description='Error message'),
        'error_code': fields.String(description='Error code')
    })
    
    # Define namespaces
    auth_ns = Namespace('auth', description='Authentication operations')
    users_ns = Namespace('users', description='User management operations')
    mops_ns = Namespace('mops', description='MOP (Method of Procedure) operations')
    assessments_ns = Namespace('assessments', description='Assessment operations')
    periodic_ns = Namespace('periodic', description='Periodic assessment operations')
    audit_ns = Namespace('audit', description='Audit log operations')
    dashboard_ns = Namespace('dashboard', description='Dashboard operations')
    
    # Add namespaces to API
    api.add_namespace(auth_ns)
    api.add_namespace(users_ns)
    api.add_namespace(mops_ns)
    api.add_namespace(assessments_ns)
    api.add_namespace(periodic_ns)
    api.add_namespace(audit_ns)
    api.add_namespace(dashboard_ns)
    
    # Authentication endpoints
    @auth_ns.route('/login')
    class Login(Resource):
        @auth_ns.expect(login_model)
        @auth_ns.response(200, 'Success', token_response)
        @auth_ns.response(401, 'Invalid credentials', error_response_model)
        def post(self):
            """User login"""
            from api.api_auth import login
            return login()
    
    @auth_ns.route('/logout')
    class Logout(Resource):
        @auth_ns.doc(security='Bearer')
        @auth_ns.response(200, 'Success', api_response_model)
        @jwt_required()
        def post(self):
            """User logout"""
            from api.api_auth import logout
            return logout()
    
    @auth_ns.route('/refresh')
    class RefreshToken(Resource):
        @auth_ns.doc(security='Bearer')
        @auth_ns.response(200, 'Success', token_response)
        @jwt_required(refresh=True)
        def post(self):
            """Refresh access token"""
            from api.api_auth import refresh
            return refresh()
    
    @auth_ns.route('/user')
    class CurrentUser(Resource):
        @auth_ns.doc(security='Bearer')
        @auth_ns.response(200, 'Success', user_model)
        @jwt_required()
        def get(self):
            """Get current user information"""
            from api.api_auth import get_current_user
            return get_current_user()
    
    # User management endpoints
    @users_ns.route('')
    class UserList(Resource):
        @users_ns.doc(security='Bearer')
        @jwt_required()
        def get(self):
            """Get list of users (admin only)"""
            from api.api_users import get_users
            return handle_api_response(get_users())
        
        @users_ns.doc(security='Bearer')
        @users_ns.expect(user_model)
        @jwt_required()
        def post(self):
            """Create new user (admin only)"""
            from api.api_users import create_user
            return handle_api_response(create_user())
    
    @users_ns.route('/<int:user_id>')
    class UserDetail(Resource):
        @users_ns.doc(security='Bearer')
        def get(self, user_id):
            """Get user by ID"""
            from api.api_users import get_user
            return handle_api_response(get_user(user_id))
        
        @users_ns.doc(security='Bearer')
        @users_ns.expect(user_model)
        def put(self, user_id):
            """Update user (admin only)"""
            from api.api_users import update_user
            return handle_api_response(update_user(user_id))
        
        @users_ns.doc(security='Bearer')
        def delete(self, user_id):
            """Delete user (admin only)"""
            from api.api_users import delete_user
            return handle_api_response(delete_user(user_id))
    
    # MOP endpoints
    @mops_ns.route('')
    class MOPList(Resource):
        @mops_ns.doc(security='Bearer')
        def get(self):
            """Get list of MOPs"""
            from api.api_mops import get_mops
            return handle_api_response(get_mops())
        
        @mops_ns.doc(security='Bearer')
        @mops_ns.expect(mop_model)
        def post(self):
            """Create new MOP"""
            from api.api_mops import create_mop
            return handle_api_response(create_mop())
    
    @mops_ns.route('/<int:mop_id>')
    class MOPDetail(Resource):
        @mops_ns.doc(security='Bearer')
        def get(self, mop_id):
            """Get MOP by ID"""
            from api.api_mops import get_mop
            return handle_api_response(get_mop(mop_id))
        
        @mops_ns.doc(security='Bearer')
        @mops_ns.expect(mop_model)
        def put(self, mop_id):
            """Update MOP"""
            from api.api_mops import update_mop
            return handle_api_response(update_mop(mop_id))
        
        @mops_ns.doc(security='Bearer')
        def delete(self, mop_id):
            """Delete MOP"""
            from api.api_mops import delete_mop
            return handle_api_response(delete_mop(mop_id))
    
    # Assessment endpoints
    @assessments_ns.route('/risk')
    class RiskAssessment(Resource):
        @assessments_ns.doc(security='Bearer')
        def post(self):
            """Start risk assessment"""
            from api.api_assessments import start_risk_assessment
            return handle_api_response(start_risk_assessment())
    
    @assessments_ns.route('/handover')
    class HandoverAssessment(Resource):
        @assessments_ns.doc(security='Bearer')
        def post(self):
            """Start handover assessment"""
            from api.api_assessments import start_handover_assessment
            return handle_api_response(start_handover_assessment())
    
    @assessments_ns.route('/executions')
    class ExecutionList(Resource):
        @assessments_ns.doc(security='Bearer')
        def get(self):
            """Get list of executions"""
            from api.api_assessments import get_assessment_results
            return handle_api_response(get_assessment_results())
    
    @assessments_ns.route('/executions/<int:execution_id>')
    class ExecutionDetail(Resource):
        @assessments_ns.doc(security='Bearer')
        def get(self, execution_id):
            """Get execution details"""
            from api.api_assessments import get_assessment_result
            return handle_api_response(get_assessment_result(execution_id))
    
    # Periodic assessment endpoints
    @periodic_ns.route('')
    class PeriodicAssessmentList(Resource):
        @periodic_ns.doc(security='Bearer')
        def get(self):
            """Get list of periodic assessments"""
            from api.api_assessments import get_periodic_assessments
            return handle_api_response(get_periodic_assessments())
        
        @periodic_ns.doc(security='Bearer')
        @periodic_ns.expect(periodic_assessment_model)
        def post(self):
            """Create periodic assessment"""
            from api.api_assessments import create_periodic_assessment
            return handle_api_response(create_periodic_assessment())
    
    @periodic_ns.route('/<int:periodic_id>')
    class PeriodicAssessmentDetail(Resource):
        @periodic_ns.doc(security='Bearer')
        def get(self, periodic_id):
            """Get periodic assessment details"""
            from api.api_assessments import get_periodic_assessment
            return handle_api_response(get_periodic_assessment(periodic_id))
        
        @periodic_ns.doc(security='Bearer')
        def delete(self, periodic_id):
            """Delete periodic assessment"""
            from api.api_assessments import delete_periodic_assessment
            return handle_api_response(delete_periodic_assessment(periodic_id))
    
    @periodic_ns.route('/<int:periodic_id>/start')
    class StartPeriodicAssessment(Resource):
        @periodic_ns.doc(security='Bearer')
        def post(self, periodic_id):
            """Start periodic assessment"""
            from api.api_assessments import start_periodic_assessment
            return handle_api_response(start_periodic_assessment(periodic_id))

    @periodic_ns.route('/<int:periodic_id>/pause')
    class PausePeriodicAssessment(Resource):
        @periodic_ns.doc(security='Bearer')
        def post(self, periodic_id):
            """Pause periodic assessment"""
            from api.api_assessments import pause_periodic_assessment
            return handle_api_response(pause_periodic_assessment(periodic_id))

    @periodic_ns.route('/<int:periodic_id>/stop')
    class StopPeriodicAssessment(Resource):
        @periodic_ns.doc(security='Bearer')
        def post(self, periodic_id):
            """Stop periodic assessment"""
            from api.api_assessments import stop_periodic_assessment
            return handle_api_response(stop_periodic_assessment(periodic_id))
    
    # Audit endpoints
    @audit_ns.route('/logs')
    class AuditLogs(Resource):
        @audit_ns.doc(security='Bearer')
        def get(self):
            """Get audit logs (admin only)"""
            from api.api_audit import get_audit_logs
            return handle_api_response(get_audit_logs())
    
    @audit_ns.route('/stats')
    class AuditStats(Resource):
        @audit_ns.doc(security='Bearer')
        def get(self):
            """Get audit statistics (admin only)"""
            from api.api_audit import get_audit_stats
            return handle_api_response(get_audit_stats())
    
    # Dashboard endpoints
    @dashboard_ns.route('/stats')
    class DashboardStats(Resource):
        @dashboard_ns.doc(security='Bearer')
        def get(self):
            """Get dashboard statistics"""
            from api.api_dashboard import get_dashboard_stats
            return handle_api_response(get_dashboard_stats())

    @dashboard_ns.route('/recent-mops')
    class DashboardRecentMops(Resource):
        @dashboard_ns.doc(security='Bearer')
        def get(self):
            """Get recent MOPs for dashboard"""
            from api.api_dashboard import get_recent_mops
            return handle_api_response(get_recent_mops())

    @dashboard_ns.route('/recent-executions')
    class DashboardRecentExecutions(Resource):
        @dashboard_ns.doc(security='Bearer')
        def get(self):
            """Get recent executions for dashboard"""
            from api.api_dashboard import get_recent_executions
            return handle_api_response(get_recent_executions())
    
    # API Health check endpoint
    @api.route('/api-health')
    class ApiHealthCheck(Resource):
        def get(self):
            """API Health check endpoint"""
            from api.api_health import get_api_health
            return handle_api_response(get_api_health())
    
    # Configure JWT security for Swagger UI
    authorizations = {
        'Bearer': {
            'type': 'apiKey',
            'in': 'header',
            'name': 'Authorization',
            'description': 'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"'
        }
    }
    
    api.authorizations = authorizations
    
    return api