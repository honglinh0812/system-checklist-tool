from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
import logging
from models.user import User
from core.auth import generate_tokens, revoke_token, get_current_user as jwt_get_current_user

logger = logging.getLogger(__name__)

# Create auth blueprint
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/login', methods=['POST'])
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

@auth_bp.route('/logout', methods=['POST'])
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

@auth_bp.route('/refresh', methods=['POST'])
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

@auth_bp.route('/user', methods=['GET'])
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