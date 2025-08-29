from flask import Blueprint
from datetime import datetime
from .api_utils import api_response, api_error
import logging

logger = logging.getLogger(__name__)

health_bp = Blueprint('health', __name__, url_prefix='/api')

@health_bp.route('/api-health', methods=['GET'])
def get_api_health():
    """API Health check endpoint"""
    try:
        return api_response({
            'status': 'ok',
            'timestamp': datetime.now().isoformat()
        }, 'API is healthy')
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return api_error('API health check failed', 500)