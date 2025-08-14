from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from werkzeug.security import generate_password_hash
from sqlalchemy import or_
from models.user import User
from models import db
from .api_utils import (
    api_response, api_error, paginate_query, validate_json, 
    admin_required, get_request_filters, apply_filters
)
from core.schemas import UserCreateSchema, UserSchema, DefaultUserCreateSchema
from core.auth import get_current_user
import logging

logger = logging.getLogger(__name__)

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

@users_bp.route('', methods=['GET'])
@jwt_required()
def get_users():
    """Get paginated list of users with filtering"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Only admin can view all users
        if current_user.role != 'admin':
            return api_error('Insufficient permissions', 403)
        
        # Get filter parameters
        filters = get_request_filters()
        
        # Build query
        query = User.query
        
        # Apply search filter
        if filters.get('search'):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                User.username.ilike(search_term)
            )
        
        # Apply role filter
        if filters.get('status'):  # Using status field for role filter
            query = query.filter(User.role == filters['status'])
        
        # Apply active status filter
        is_active = request.args.get('is_active')
        if is_active is not None:
            query = query.filter(User.is_active == (is_active.lower() == 'true'))
        
        # Apply sorting
        sort_by = filters.get('sort_by', 'created_at')
        sort_order = filters.get('sort_order', 'desc')
        
        if hasattr(User, sort_by):
            column = getattr(User, sort_by)
            if sort_order.lower() == 'desc':
                query = query.order_by(column.desc())
            else:
                query = query.order_by(column.asc())
        
        # Paginate
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        
        result = paginate_query(query, page, per_page)
        
        # Serialize users
        user_schema = UserSchema(many=True)
        users_data = user_schema.dump(result['items'])
        
        return api_response({
            'users': users_data,
            'pagination': result['pagination']
        })
        
    except Exception as e:
        logger.error(f"Get users error: {str(e)}")
        return api_error('Failed to fetch users', 500)

@users_bp.route('/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user(user_id):
    """Get user details by ID"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Users can only view their own profile unless they're admin
        if current_user.role != 'admin' and current_user.id != user_id:
            return api_error('Insufficient permissions', 403)
        
        user = User.query.get(user_id)
        if not user:
            return api_error('User not found', 404)
        
        user_schema = UserSchema()
        user_data = user_schema.dump(user)
        
        # Add additional stats for admin
        if current_user.role == 'admin':
            from models.mop import MOP
            from models.execution import ExecutionHistory
            
            user_data['stats'] = {
                'total_mops': MOP.query.filter_by(created_by=user.id).count(),
                'total_executions': ExecutionHistory.query.filter_by(user_id=user.id).count(),
                'pending_mops': MOP.query.filter_by(created_by=user.id, status='pending_review').count()
            }
        
        return api_response(user_data)
        
    except Exception as e:
        logger.error(f"Get user error: {str(e)}")
        return api_error('Failed to fetch user', 500)

@users_bp.route('', methods=['POST'])
@admin_required
@validate_json(UserCreateSchema())
def create_user():
    """Create a new user (admin only)"""
    try:
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        data = json_data
        
        # Check if username already exists
        if User.query.filter_by(username=data['username']).first():
            return api_error('Username already exists', 400)
        
        # Check if email already exists
        if User.query.filter_by(email=data['email']).first():
            return api_error('Email already exists', 400)
        
        # Create new user
        user = User(
            username=data['username'],
            email=data['email'],
            full_name=data['full_name'],
            password=data['password'],
            role=data['role']
        )
        user.is_active = True
        
        db.session.add(user)
        db.session.commit()
        
        user_schema = UserSchema()
        user_data = user_schema.dump(user)
        
        logger.info(f"User created: {user.username} by admin {get_current_user().username}")
        
        return api_response(user_data, 'User created successfully', 201)
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Create user error: {str(e)}")
        return api_error('Failed to create user', 500)

@users_bp.route('/create-default', methods=['POST'])
@admin_required
@validate_json(DefaultUserCreateSchema())
def create_default_user():
    """Create a default user account with relaxed password policy (admin only)"""
    try:
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        data = json_data
        
        # Check if username already exists
        if User.query.filter_by(username=data['username']).first():
            return api_error('Username already exists', 400)
        
        # Check if email already exists
        if User.query.filter_by(email=data['email']).first():
            return api_error('Email already exists', 400)
        
        # Create new default user (no password length restriction)
        user = User(
            username=data['username'],
            email=data['email'],
            full_name=data['full_name'],
            role=data['role'],
            password_hash=generate_password_hash(data['password']),
            is_active=True
        )
        
        db.session.add(user)
        db.session.commit()
        
        user_schema = UserSchema()
        user_data = user_schema.dump(user)
        
        logger.info(f"Default user created: {user.username} by admin {get_current_user().username}")
        
        return api_response(user_data, 'Default user created successfully', 201)
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Create default user error: {str(e)}")
        return api_error('Failed to create default user', 500)

@users_bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id):
    """Update user details"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        user = User.query.get(user_id)
        if not user:
            return api_error('User not found', 404)
        
        # Users can only update their own profile (except role and is_active)
        # Admins can update any user
        if current_user.role != 'admin' and current_user.id != user_id:
            return api_error('Insufficient permissions', 403)
        
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        data = json_data
        
        # Non-admin users cannot change role or is_active
        if current_user.role != 'admin':
            data.pop('role', None)
            data.pop('is_active', None)
        
        # Email field not supported in current User model
        
        # Update user fields
        for field, value in data.items():
            if hasattr(user, field):
                setattr(user, field, value)
        
        db.session.commit()
        
        user_schema = UserSchema()
        user_data = user_schema.dump(user)
        
        logger.info(f"User updated: {user.username} by {current_user.username}")
        
        return api_response(user_data, 'User updated successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Update user error: {str(e)}")
        return api_error('Failed to update user', 500)

@users_bp.route('/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete user (admin only)"""
    try:
        current_user = get_current_user()
        
        # Prevent admin from deleting themselves
        if current_user.id == user_id:
            return api_error('Cannot delete your own account', 400)
        
        user = User.query.get(user_id)
        if not user:
            return api_error('User not found', 404)
        
        # Check if user has associated data
        from models.mop import MOP
        from models.execution import ExecutionHistory
        
        user_mops = MOP.query.filter_by(created_by=user.id).count()
        user_executions = ExecutionHistory.query.filter_by(executed_by=user.id).count()
        
        if user_mops > 0 or user_executions > 0:
            # Instead of deleting, deactivate the user
            user.is_active = False
            db.session.commit()
            
            logger.info(f"User deactivated: {user.username} by admin {current_user.username}")
            return api_response(None, 'User deactivated due to existing data associations')
        else:
            # Safe to delete
            username = user.username
            db.session.delete(user)
            db.session.commit()
            
            logger.info(f"User deleted: {username} by admin {current_user.username}")
            return api_response(None, 'User deleted successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Delete user error: {str(e)}")
        return api_error('Failed to delete user', 500)

@users_bp.route('/<int:user_id>/activate', methods=['POST'])
@admin_required
def activate_user(user_id):
    """Activate/deactivate user (admin only)"""
    try:
        user = User.query.get(user_id)
        if not user:
            return api_error('User not found', 404)
        
        is_active = request.json.get('is_active', True)
        user.is_active = is_active
        db.session.commit()
        
        action = 'activated' if is_active else 'deactivated'
        logger.info(f"User {action}: {user.username} by admin {get_current_user().username}")
        
        return api_response(None, f'User {action} successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Activate user error: {str(e)}")
        return api_error('Failed to update user status', 500)

@users_bp.route('/<int:user_id>/reset-password', methods=['POST'])
@admin_required
def reset_user_password(user_id):
    """Reset user password (admin only)"""
    try:
        user = User.query.get(user_id)
        if not user:
            return api_error('User not found', 404)
        
        new_password = request.json.get('new_password')
        if not new_password or len(new_password) < 6:
            return api_error('Password must be at least 6 characters long', 400)
        
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        
        logger.info(f"Password reset for user: {user.username} by admin {get_current_user().username}")
        
        return api_response(None, 'Password reset successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Reset password error: {str(e)}")
        return api_error('Failed to reset password', 500)

@users_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_my_profile():
    """Get current user's profile"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        user_schema = UserSchema()
        user_data = user_schema.dump(current_user)
        
        # Add user statistics
        from models.mop import MOP
        from models.execution import ExecutionHistory
        
        user_data['stats'] = {
            'total_mops': MOP.query.filter_by(created_by=current_user.id).count(),
            'total_executions': ExecutionHistory.query.filter_by(executed_by=current_user.id).count(),
            'pending_mops': MOP.query.filter_by(created_by=current_user.id, status='pending_review').count()
        }
        
        return api_response(user_data)
        
    except Exception as e:
        logger.error(f"Get profile error: {str(e)}")
        return api_error('Failed to fetch profile', 500)

@users_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_my_profile():
    """Update current user's profile"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        data = json_data
        
        # Basic validation
        if 'current_password' not in data or 'new_password' not in data:
            return api_error('Current password and new password are required', 400)
        
        # Users cannot change their own role or is_active status
        data.pop('role', None)
        data.pop('is_active', None)
        
        # Email field not supported in current User model
        
        # Update user fields
        for field, value in data.items():
            if hasattr(current_user, field):
                setattr(current_user, field, value)
        
        db.session.commit()
        
        user_schema = UserSchema()
        user_data = user_schema.dump(current_user)
        
        logger.info(f"Profile updated by user: {current_user.username}")
        
        return api_response(user_data, 'Profile updated successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Update profile error: {str(e)}")
        return api_error('Failed to update profile', 500)

@users_bp.route('/<int:user_id>/status', methods=['PUT'])
@admin_required
def change_user_status(user_id):
    """Change user status (activate/deactivate)"""
    try:
        user = User.query.get_or_404(user_id)
        
        data = request.get_json()
        if not data or 'is_active' not in data:
            return api_error('is_active field is required', 400)
        
        is_active = data['is_active']
        if not isinstance(is_active, bool):
            return api_error('is_active must be a boolean', 400)
        
        # Prevent deactivating the last admin
        if not is_active and user.role == 'admin':
            active_admins = User.query.filter_by(role='admin', is_active=True).count()
            if active_admins <= 1:
                return api_error('Cannot deactivate the last admin user', 400)
        
        user.is_active = is_active
        db.session.commit()
        
        action = 'activated' if is_active else 'deactivated'
        logger.info(f"User {user_id} {action}")
        
        return api_response({
            'message': f'User {action} successfully',
            'user': {
                'id': user.id,
                'username': user.username,
                'is_active': user.is_active
            }
        })
        
    except Exception as e:
        logger.error(f"Error changing user status: {str(e)}")
        db.session.rollback()
        return api_error('Failed to change user status', 500)

@users_bp.route('/profile/change-password', methods=['POST'])
@jwt_required()
def change_my_password():
    """Change password for current user"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        data = request.validated_json
        # verify current password
        if not current_user.check_password(data['current_password']):
            return api_error('Current password is incorrect', 400)
        # set new password
        current_user.set_password(data['new_password'])
        db.session.commit()
        logger.info(f"Password changed by user: {current_user.username}")
        return api_response(None, 'Password changed successfully')
    except Exception as e:
        db.session.rollback()
        logger.error(f"Change password error: {str(e)}")
        return api_error('Failed to change password', 500)