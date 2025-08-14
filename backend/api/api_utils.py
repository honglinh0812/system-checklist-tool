from flask import request, jsonify
from marshmallow import ValidationError
from functools import wraps
from flask_jwt_extended import jwt_required, get_jwt
import math

def paginate_query(query, page=None, per_page=None, max_per_page=100):
    """Paginate a SQLAlchemy query"""
    if page is None:
        page = request.args.get('page', 1, type=int)
    if per_page is None:
        per_page = min(
            request.args.get('per_page', 20, type=int),
            max_per_page
        )
    
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    
    return {
        'items': items,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'pages': math.ceil(total / per_page),
            'has_prev': page > 1,
            'has_next': page < math.ceil(total / per_page)
        }
    }

def validate_json(schema):
    """Decorator to validate JSON request data using Marshmallow schema"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                json_data = request.get_json()
                if json_data is None:
                    return jsonify({'error': 'No JSON data provided'}), 400
                
                # Validate and deserialize
                result = schema.load(json_data)
                request.validated_json = result
                return f(*args, **kwargs)
            except ValidationError as err:
                return jsonify({'error': 'Validation failed', 'messages': err.messages}), 400
        return decorated_function
    return decorator

def api_response(data=None, message=None, status_code=200, pagination=None):
    """Standardized API response format"""
    response = {
        'success': 200 <= status_code < 300,
        'message': message
    }
    
    if data is not None:
        response['data'] = data
    
    if pagination is not None:
        response['pagination'] = pagination
    
    return jsonify(response), status_code

def api_error(message, status_code=400, errors=None):
    """Standardized API error response"""
    response = {
        'success': False,
        'message': message
    }
    
    if errors is not None:
        response['errors'] = errors
    
    return jsonify(response), status_code

def require_role(required_role):
    """Decorator to require specific user role"""
    def decorator(f):
        @wraps(f)
        @jwt_required()
        def decorated_function(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get('role')
            
            if user_role != required_role and user_role != 'admin':
                return api_error('Insufficient permissions', 403)
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def admin_required(f):
    """Decorator to require admin role"""
    return require_role('admin')(f)

def handle_db_error(func):
    """Decorator to handle database errors"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            # Log the error
            import logging
            logging.error(f"Database error in {func.__name__}: {str(e)}")
            return api_error('Database operation failed', 500)
    return wrapper

def get_request_filters():
    """Extract common filter parameters from request"""
    return {
        'search': request.args.get('search', '').strip(),
        'sort_by': request.args.get('sort_by', 'id'),
        'sort_order': request.args.get('sort_order', 'asc'),
        'status': request.args.get('status'),
        'date_from': request.args.get('date_from'),
        'date_to': request.args.get('date_to')
    }

def apply_filters(query, model, filters):
    """Apply common filters to a query"""
    # Search filter
    if filters.get('search'):
        search_term = f"%{filters['search']}%"
        if hasattr(model, 'name'):
            query = query.filter(model.name.ilike(search_term))
        elif hasattr(model, 'title'):
            query = query.filter(model.title.ilike(search_term))
    
    # Status filter
    if filters.get('status') and hasattr(model, 'status'):
        query = query.filter(model.status == filters['status'])
    
    # Date range filter
    if filters.get('date_from') and hasattr(model, 'created_at'):
        query = query.filter(model.created_at >= filters['date_from'])
    
    if filters.get('date_to') and hasattr(model, 'created_at'):
        query = query.filter(model.created_at <= filters['date_to'])
    
    # Sorting
    sort_by = filters.get('sort_by', 'id')
    sort_order = filters.get('sort_order', 'asc')
    
    if hasattr(model, sort_by):
        column = getattr(model, sort_by)
        if sort_order.lower() == 'desc':
            query = query.order_by(column.desc())
        else:
            query = query.order_by(column.asc())
    
    return query