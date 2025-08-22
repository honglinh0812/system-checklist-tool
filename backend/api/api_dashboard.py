from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, desc
from datetime import datetime, timedelta, timezone
from models.mop import MOP, MOPReview
from models.execution import ExecutionHistory
from models.user import User
from models import db
from .api_utils import api_response, api_error, get_request_filters, apply_filters
from core.auth import get_current_user
import logging

logger = logging.getLogger(__name__)

# GMT+7 timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')

@dashboard_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Basic statistics (only approved and pending status)
        total_mops = MOP.query.filter(MOP.status.in_(['approved', 'pending'])).count()
        pending_mops = MOP.query.filter_by(status='pending').count()
        approved_mops = MOP.query.filter_by(status='approved').count()
        total_executions = ExecutionHistory.query.count()
        
        # User-specific stats
        user_mops = MOP.query.filter_by(created_by=current_user.id).count()
        user_executions = ExecutionHistory.query.filter_by(executed_by=current_user.id).count()
        
        # Recent activity (last 7 days)
        week_ago = datetime.now(GMT_PLUS_7) - timedelta(days=7)
        recent_mops = MOP.query.filter(MOP.created_at >= week_ago).count()
        recent_executions = ExecutionHistory.query.filter(ExecutionHistory.started_at >= week_ago).count()
        
        # Status distribution
        mop_status_stats = db.session.query(
            MOP.status,
            func.count(MOP.id).label('count')
        ).group_by(MOP.status).all()
        
        # Execution status distribution
        execution_status_stats = db.session.query(
            ExecutionHistory.status,
            func.count(ExecutionHistory.id).label('count')
        ).group_by(ExecutionHistory.status).all()
        
        # User-specific execution count for current user (only risk/handover assessments)
        user_executions_count = ExecutionHistory.query.filter(
            ExecutionHistory.executed_by == current_user.id,
            db.or_(
                ExecutionHistory.risk_assessment == True,
                ExecutionHistory.handover_assessment == True
            )
        ).count()
        
        return api_response({
            'overview': {
                'total_mops': total_mops,
                'pending_mops': pending_mops,
                'approved_mops': approved_mops,
                'total_executions': total_executions,
                'user_mops': user_mops,
                'user_executions': user_executions_count
            },
            'recent_activity': {
                'new_mops_this_week': recent_mops,
                'executions_this_week': recent_executions
            },
            'distributions': {
                'mop_status': [{'status': str(status), 'count': count} for status, count in mop_status_stats],
                'execution_status': [{'status': status, 'count': count} for status, count in execution_status_stats]
            }
        })
        
    except Exception as e:
        logger.error(f"Dashboard stats error: {str(e)}")
        return api_error('Failed to fetch dashboard statistics', 500)

@dashboard_bp.route('/recent-activities', methods=['GET'])
@jwt_required()
def get_recent_activities():
    """Get recent activities for dashboard"""
    try:
        limit = request.args.get('limit', 10, type=int)
        limit = min(limit, 50)  # Max 50 items
        
        # Recent MOPs
        recent_mops = MOP.query.order_by(desc(MOP.created_at)).limit(limit).all()
        
        # Recent executions
        recent_executions = ExecutionHistory.query.order_by(desc(ExecutionHistory.started_at)).limit(limit).all()
        
        # Recent reviews
        recent_reviews = MOPReview.query.order_by(desc(MOPReview.reviewed_at)).limit(limit).all()
        
        activities = []
        
        # Add MOP activities
        for mop in recent_mops:
            activities.append({
                'type': 'mop_created',
                'title': f'MOP "{mop.name}" created',
                'description': mop.description[:100] + '...' if len(mop.description) > 100 else mop.description,
                'timestamp': mop.created_at.isoformat(),
                'user': mop.created_by_user.username if mop.created_by_user else 'Unknown',
                'status': mop.status,
                'priority': mop.priority,
                'id': mop.id,
                'entity_type': 'mop'
            })
        
        # Add execution activities
        for execution in recent_executions:
            mop = db.session.get(MOP, execution.mop_id) if execution.mop_id else None
            executor = db.session.get(User, execution.executed_by) if execution.executed_by else None
            activities.append({
                'type': 'execution_started',
                'title': f'Execution of "{mop.name if mop else "Unknown MOP"}" {execution.status or "started"}',
                'description': f'Executed on {len(execution.server_results) if hasattr(execution, "server_results") else "unknown"} servers',
                'timestamp': execution.started_at.isoformat() if execution.started_at else execution.created_at.isoformat() if hasattr(execution, "created_at") else datetime.now(GMT_PLUS_7).isoformat(),
                'user': executor.username if executor else 'Unknown',
                'status': execution.status or 'started',
                'id': execution.id,
                'entity_type': 'execution'
            })
        
        # Add review activities
        for review in recent_reviews:
            mop = db.session.get(MOP, review.mop_id) if review.mop_id else None
            reviewer = db.session.get(User, review.admin_id) if review.admin_id else None
            activities.append({
                'type': 'mop_reviewed',
                'title': f'MOP "{mop.name if mop else "Unknown MOP"}" {review.status or review.action if hasattr(review, "action") else "reviewed"}',
                'description': (review.comments[:100] + '...' if len(review.comments) > 100 else review.comments) if review.comments else (review.reject_reason[:100] + '...' if review.reject_reason and len(review.reject_reason) > 100 else review.reject_reason or 'No comments'),
                'timestamp': review.reviewed_at.isoformat() if review.reviewed_at else datetime.now(GMT_PLUS_7).isoformat(),
                'user': reviewer.username if reviewer else 'Unknown',
                'action': review.status or (review.action if hasattr(review, "action") else 'reviewed'),
                'id': review.mop_id,
                'entity_type': 'review'
            })
        
        # Sort by timestamp and limit
        activities.sort(key=lambda x: x['timestamp'], reverse=True)
        activities = activities[:limit]
        
        return api_response({
            'activities': activities,
            'total': len(activities)
        })
        
    except Exception as e:
        logger.error(f"Recent activities error: {str(e)}")
        return api_error('Failed to fetch recent activities', 500)

@dashboard_bp.route('/my-tasks', methods=['GET'])
@jwt_required()
def get_my_tasks():
    """Get current user's pending tasks"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        tasks = []
        
        # MOPs pending review (for reviewers)
        if current_user.role in ['admin', 'reviewer']:
            pending_mops = MOP.query.filter_by(status='pending_review').all()
            for mop in pending_mops:
                tasks.append({
                    'type': 'review_required',
                    'title': f'Review MOP: {mop.name}',
                    'description': mop.description[:100] + '...' if len(mop.description) > 100 else mop.description,
                    'priority': mop.priority,
                    'created_at': mop.created_at.isoformat(),
                    'id': mop.id,
                    'entity_type': 'mop'
                })
        
        # User's draft MOPs
        draft_mops = MOP.query.filter_by(
            created_by=current_user.id,
            status='draft'
        ).all()
        
        for mop in draft_mops:
            tasks.append({
                'type': 'draft_completion',
                'title': f'Complete MOP: {mop.name}',
                'description': 'Draft MOP needs to be completed and submitted for review',
                'priority': mop.priority,
                'created_at': mop.created_at.isoformat(),
                'id': mop.id,
                'entity_type': 'mop'
            })
        
        # User's running executions
        running_executions = ExecutionHistory.query.filter_by(
            executed_by=current_user.id,
            status='running'
        ).all()
        
        for execution in running_executions:
            tasks.append({
                'type': 'execution_monitoring',
                'title': f'Monitor execution: {execution.mop.name}',
                'description': f'Execution started at {execution.created_at.strftime("%Y-%m-%d %H:%M")}',
                'priority': 'high',
                'created_at': execution.created_at.isoformat(),
                'id': execution.id,
                'entity_type': 'execution'
            })
        
        # Sort by priority and creation date
        priority_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        tasks.sort(key=lambda x: (priority_order.get(x.get('priority', 'low'), 3), x['created_at']), reverse=True)
        
        return api_response({
            'tasks': tasks,
            'total': len(tasks)
        })
        
    except Exception as e:
        logger.error(f"My tasks error: {str(e)}")
        return api_error('Failed to fetch user tasks', 500)

@dashboard_bp.route('/charts', methods=['GET'])
@jwt_required()
def get_dashboard_charts():
    """Get chart data for dashboard"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get date range (default last 30 days)
        days = request.args.get('days', 30, type=int)
        days = min(days, 365)  # Max 1 year
        
        end_date = datetime.now(GMT_PLUS_7)
        start_date = end_date - timedelta(days=days)
        
        # MOPs created over time
        mop_timeline = db.session.query(
            func.date(MOP.created_at).label('date'),
            func.count(MOP.id).label('count')
        ).filter(
            MOP.created_at >= start_date
        ).group_by(func.date(MOP.created_at)).order_by('date').all()
        
        # Executions over time
        execution_timeline = db.session.query(
            func.date(ExecutionHistory.created_at).label('date'),
            func.count(ExecutionHistory.id).label('count')
        ).filter(
            ExecutionHistory.created_at >= start_date
        ).group_by(func.date(ExecutionHistory.created_at)).order_by('date').all()
        
        # Risk level distribution (pie chart)
        risk_distribution = db.session.query(
            MOP.risk_level,
            func.count(MOP.id).label('count')
        ).group_by(MOP.risk_level).all()
        
        # Status distribution (pie chart)
        status_distribution = db.session.query(
            MOP.status,
            func.count(MOP.id).label('count')
        ).group_by(MOP.status).all()
        
        # Execution success rate over time
        execution_success = db.session.query(
            func.date(ExecutionHistory.created_at).label('date'),
            func.count(ExecutionHistory.id).label('total'),
            func.sum(func.case([(ExecutionHistory.status == 'completed', 1)], else_=0)).label('successful')
        ).filter(
            ExecutionHistory.created_at >= start_date
        ).group_by(func.date(ExecutionHistory.created_at)).order_by('date').all()
        
        # Category distribution (bar chart)
        category_distribution = db.session.query(
            MOP.category,
            func.count(MOP.id).label('count')
        ).group_by(MOP.category).order_by(func.count(MOP.id).desc()).all()
        
        return api_response({
            'timeline': {
                'mops': [{'date': str(item.date), 'count': item.count} for item in mop_timeline],
                'executions': [{'date': str(item.date), 'count': item.count} for item in execution_timeline]
            },
            'distributions': {
                'risk_levels': [{'label': item.risk_level or 'Unknown', 'value': item.count} for item in risk_distribution],
                'status': [{'label': item.status, 'value': item.count} for item in status_distribution],
                'categories': [{'label': item.category or 'Unknown', 'value': item.count} for item in category_distribution]
            },
            'success_rate': [
                {
                    'date': str(item.date),
                    'total': item.total,
                    'successful': item.successful or 0,
                    'rate': round((item.successful or 0) / item.total * 100, 2) if item.total > 0 else 0
                } for item in execution_success
            ]
        })
        
    except Exception as e:
        logger.error(f"Dashboard charts error: {str(e)}")
        return api_error('Failed to fetch chart data', 500)

@dashboard_bp.route('/recent-mops', methods=['GET'])
@jwt_required()
def get_recent_mops():
    """Get recent MOPs for dashboard"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        limit = request.args.get('limit', 10, type=int)
        limit = min(limit, 50)  # Max 50 items
        
        # Get recent MOPs based on user role (only approved and pending)
        query = MOP.query.filter(MOP.status.in_(['approved', 'pending']))
        if current_user.role == 'user':
            query = query.filter(MOP.created_by == current_user.id)
        
        recent_mops = query.order_by(desc(MOP.created_at)).limit(limit).all()
        
        mops_data = []
        for mop in recent_mops:
            creator = db.session.get(User, mop.created_by)
            # Get approved time if status is approved
            approved_time = None
            if mop.status == 'approved' and mop.approved_by:
                # Look for the most recent review with approved status
                approved_review = MOPReview.query.filter_by(
                    mop_id=mop.id, 
                    status='approved'
                ).order_by(desc(MOPReview.reviewed_at)).first()
                if approved_review:
                    approved_time = approved_review.reviewed_at.isoformat()
            
            mops_data.append({
                'id': mop.id,
                'name': mop.name,
                'status': mop.status,
                'created_at': mop.created_at.isoformat(),
                'approved_at': approved_time,
                'created_by': {
                    'id': creator.id,
                    'username': creator.username
                } if creator else None
            })
        
        return api_response({
            'mops': mops_data,
            'total': len(mops_data)
        })
        
    except Exception as e:
        logger.error(f"Recent MOPs error: {str(e)}")
        return api_error('Failed to fetch recent MOPs', 500)

@dashboard_bp.route('/recent-executions', methods=['GET'])
@jwt_required()
def get_recent_executions():
    """Get recent executions for dashboard"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        limit = request.args.get('limit', 10, type=int)
        limit = min(limit, 50)  # Max 50 items
        
        # Get recent executions from AssessmentResult (risk/handover assessments)
        from models.assessment import AssessmentResult
        
        query = AssessmentResult.query
        if current_user.role == 'user':
            query = query.filter(AssessmentResult.executed_by == current_user.id)
        
        # Order by created_at (most recent first)
        recent_executions = query.order_by(desc(AssessmentResult.created_at)).limit(limit).all()
        
        executions_data = []
        for execution in recent_executions:
            executor = db.session.get(User, execution.executed_by)
            mop = db.session.get(MOP, execution.mop_id) if execution.mop_id else None
            
            # Calculate duration if both started_at and completed_at exist
            duration = None
            if execution.started_at and execution.completed_at:
                duration = (execution.completed_at - execution.started_at).total_seconds()
            
            executions_data.append({
                'id': execution.id,
                'started_at': execution.started_at.isoformat() if execution.started_at else None,
                'completed_at': execution.completed_at.isoformat() if execution.completed_at else None,
                'status': execution.status,
                'duration': duration,
                'dry_run': False,  # AssessmentResult doesn't have dry_run field
                'output': execution.execution_logs,
                'error_output': execution.error_message,
                'executed_by': {
                    'id': executor.id,
                    'username': executor.username
                } if executor else None,
                'mop': {
                    'id': mop.id,
                    'name': mop.name
                } if mop else None,
                # Legacy fields for backward compatibility
                'execution_time': execution.created_at.isoformat() if execution.created_at else None,
                'risk_assessment': execution.assessment_type == 'risk',
                'handover_assessment': execution.assessment_type == 'handover'
            })
        
        return api_response({
            'executions': executions_data,
            'total': len(executions_data)
        })
        
    except Exception as e:
        logger.error(f"Recent executions error: {str(e)}")
        return api_error('Failed to fetch recent executions', 500)

@dashboard_bp.route('/system-health', methods=['GET'])
@jwt_required()
def get_system_health():
    """Get system health metrics"""
    try:
        # Database connectivity check
        try:
            db.session.execute('SELECT 1')
            db_status = 'healthy'
        except Exception:
            db_status = 'unhealthy'
        
        # Recent error rate
        hour_ago = datetime.now(GMT_PLUS_7) - timedelta(hours=1)
        failed_executions = ExecutionHistory.query.filter(
            ExecutionHistory.created_at >= hour_ago,
            ExecutionHistory.status == 'failed'
        ).count()
        
        total_executions = ExecutionHistory.query.filter(
            ExecutionHistory.created_at >= hour_ago
        ).count()
        
        error_rate = (failed_executions / total_executions * 100) if total_executions > 0 else 0
        
        # System metrics
        health_metrics = {
            'database': {
                'status': db_status,
                'last_check': datetime.now(GMT_PLUS_7).isoformat()
            },
            'executions': {
                'error_rate_1h': round(error_rate, 2),
                'failed_count_1h': failed_executions,
                'total_count_1h': total_executions
            },
            'overall_status': 'healthy' if db_status == 'healthy' and error_rate < 10 else 'warning'
        }
        
        return api_response(health_metrics)
        
    except Exception as e:
        logger.error(f"System health error: {str(e)}")
        return api_error('Failed to fetch system health', 500)