from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import desc, and_
from datetime import datetime, timedelta
from models.audit_log import UserActivityLog, ActionType, ResourceType
from models.user import User
from models import db
from .api_utils import (
    api_response, api_error, paginate_query, require_role
)
from core.auth import get_current_user
import logging

logger = logging.getLogger(__name__)

audit_bp = Blueprint('audit', __name__, url_prefix='/api/audit')

@audit_bp.route('/logs', methods=['GET'])
@require_role('admin')
def get_audit_logs():
    """Get audit logs with filtering and pagination"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 50, type=int), 100)
        
        # Filtering parameters
        user_id = request.args.get('user_id', type=int)
        username = request.args.get('username')
        action = request.args.get('action')
        resource_type = request.args.get('resource_type')
        resource_id = request.args.get('resource_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # Build query
        query = UserActivityLog.query
        
        # Apply filters
        if user_id:
            query = query.filter(UserActivityLog.user_id == user_id)
        
        if username:
            query = query.filter(UserActivityLog.username.ilike(f'%{username}%'))
        
        if action:
            try:
                action_enum = ActionType(action.lower())
                query = query.filter(UserActivityLog.action == action_enum)
            except ValueError:
                return api_error(f'Invalid action type: {action}', 400)
        
        if resource_type:
            try:
                resource_enum = ResourceType(resource_type.lower())
                query = query.filter(UserActivityLog.resource_type == resource_enum)
            except ValueError:
                return api_error(f'Invalid resource type: {resource_type}', 400)
        
        if resource_id:
            query = query.filter(UserActivityLog.resource_id == resource_id)
        
        # Date range filtering
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                query = query.filter(UserActivityLog.created_at >= start_dt)
            except ValueError:
                return api_error('Invalid start_date format. Use ISO format.', 400)
        
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                query = query.filter(UserActivityLog.created_at <= end_dt)
            except ValueError:
                return api_error('Invalid end_date format. Use ISO format.', 400)
        
        # Order by created_at descending (newest first)
        query = query.order_by(desc(UserActivityLog.created_at))
        
        # Paginate
        pagination = query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )
        
        # Format results
        logs = []
        for log in pagination.items:
            logs.append({
                'id': log.id,
                'user_id': log.user_id,
                'username': log.username,
                'action': log.action.value,
                'resource_type': log.resource_type.value,
                'resource_id': log.resource_id,
                'resource_name': log.resource_name,
                'details': log.details,
                'ip_address': log.ip_address,
                'user_agent': log.user_agent,
                'created_at': log.created_at.isoformat() if log.created_at else None
            })
        
        return api_response({
            'logs': logs,
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
        logger.error(f"Error getting audit logs: {str(e)}")
        return api_error('Failed to get audit logs', 500)

@audit_bp.route('/stats', methods=['GET'])
@require_role('admin')
def get_audit_stats():
    """Get audit log statistics"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get date range (default to last 30 days)
        days = request.args.get('days', 30, type=int)
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Total logs count
        total_logs = UserActivityLog.query.filter(
            UserActivityLog.created_at >= start_date
        ).count()
        
        # Action type breakdown
        action_stats = db.session.query(
            UserActivityLog.action,
            db.func.count(UserActivityLog.id).label('count')
        ).filter(
            UserActivityLog.created_at >= start_date
        ).group_by(UserActivityLog.action).all()
        
        # Resource type breakdown
        resource_stats = db.session.query(
            UserActivityLog.resource_type,
            db.func.count(UserActivityLog.id).label('count')
        ).filter(
            UserActivityLog.created_at >= start_date
        ).group_by(UserActivityLog.resource_type).all()
        
        # Top users by activity
        user_stats = db.session.query(
            UserActivityLog.username,
            db.func.count(UserActivityLog.id).label('count')
        ).filter(
            UserActivityLog.created_at >= start_date
        ).group_by(UserActivityLog.username).order_by(
            desc(db.func.count(UserActivityLog.id))
        ).limit(10).all()
        
        return api_response({
            'period_days': days,
            'total_logs': total_logs,
            'action_breakdown': [
                {'action': stat.action.value, 'count': stat.count}
                for stat in action_stats
            ],
            'resource_breakdown': [
                {'resource_type': stat.resource_type.value, 'count': stat.count}
                for stat in resource_stats
            ],
            'top_users': [
                {'username': stat.username, 'activity_count': stat.count}
                for stat in user_stats
            ]
        })
        
    except Exception as e:
        logger.error(f"Error getting audit stats: {str(e)}")
        return api_error('Failed to get audit statistics', 500)

@audit_bp.route('/cleanup', methods=['POST'])
@require_role('admin')
def cleanup_old_logs():
    """Cleanup old audit logs (older than 1 year)"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get retention period (default 365 days)
        retention_days = request.json.get('retention_days', 365) if request.json else 365
        
        deleted_count = UserActivityLog.cleanup_old_logs(retention_days)
        
        logger.info(f"Cleaned up {deleted_count} old audit logs by {current_user.username}")
        
        return api_response({
            'message': f'Successfully cleaned up {deleted_count} old audit logs',
            'deleted_count': deleted_count,
            'retention_days': retention_days
        })
        
    except Exception as e:
        logger.error(f"Error cleaning up audit logs: {str(e)}")
        return api_error('Failed to cleanup audit logs', 500)