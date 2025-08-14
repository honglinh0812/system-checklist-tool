from flask_jwt_extended import JWTManager, create_access_token, create_refresh_token, jwt_required, get_jwt_identity, get_jwt
from werkzeug.security import check_password_hash
from models.user import User
from datetime import timedelta
import redis

# JWT blacklist storage (in-memory for development, Redis for production)
blacklisted_tokens = set()

def init_jwt(app):
    """Initialize JWT extension with the Flask app"""
    jwt = JWTManager(app)
    
    # Configure JWT callbacks
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload['jti']
        return jti in blacklisted_tokens
    
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return {
            'message': 'Token has expired',
            'error': 'token_expired'
        }, 401
    
    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return {
            'message': 'Invalid token',
            'error': 'invalid_token'
        }, 401
    
    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return {
            'message': 'Authorization token is required',
            'error': 'authorization_required'
        }, 401
    
    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return {
            'message': 'Token has been revoked',
            'error': 'token_revoked'
        }, 401
    
    return jwt

def authenticate_user(username, password):
    """Authenticate user and return user object if valid"""
    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password_hash, password):
        return user
    return None

def generate_tokens(user):
    """Generate access and refresh tokens for user"""
    additional_claims = {
        'user_id': user.id,
        'username': user.username,
        'role': user.role
    }
    
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims=additional_claims
    )
    
    refresh_token = create_refresh_token(
        identity=str(user.id),
        additional_claims=additional_claims
    )
    
    return {
        'access_token': access_token,
        'refresh_token': refresh_token
    }

def revoke_token(jti):
    """Add token to blacklist"""
    blacklisted_tokens.add(jti)

def get_current_user():
    """Get current user from JWT token"""
    user_id = get_jwt_identity()
    # Convert string identity back to integer for database query
    try:
        user_id_int = int(user_id) if user_id else None
        user = User.query.get(user_id_int) if user_id_int else None
    except (ValueError, TypeError):
        user = None
    return user