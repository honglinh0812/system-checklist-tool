from flask import request
from models.audit_log import UserActivityLog, ActionType, ResourceType
from models import db
import logging

logger = logging.getLogger(__name__)

def log_user_activity(user_id, username, action, resource_type, 
                     resource_id=None, resource_name=None, details=None):
    """
    Log user activity for audit trail
    
    Args:
        user_id (int): ID of the user performing the action
        username (str): Username of the user
        action (ActionType): Type of action performed
        resource_type (ResourceType): Type of resource affected
        resource_id (int, optional): ID of the affected resource
        resource_name (str, optional): Name of the affected resource
        details (dict, optional): Additional details about the action
    """
    try:
        # Get client IP and user agent from request context
        ip_address = None
        user_agent = None
        
        if request:
            ip_address = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR'))
            user_agent = request.headers.get('User-Agent')
        
        # Create log entry
        log_entry = UserActivityLog.log_action(
            user_id=user_id,
            username=username,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_name=resource_name,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        # Commit to database
        db.session.commit()
        
        logger.info(f"Activity logged: {username} {action.value} {resource_type.value} {resource_id or ''}")
        
        return log_entry
        
    except Exception as e:
        logger.error(f"Failed to log user activity: {str(e)}")
        db.session.rollback()
        return None

def log_mop_action(user_id, username, action, mop_id, mop_name, details=None):
    """
    Convenience function for logging MOP-related actions
    """
    return log_user_activity(
        user_id=user_id,
        username=username,
        action=action,
        resource_type=ResourceType.MOP,
        resource_id=mop_id,
        resource_name=mop_name,
        details=details
    )

def log_user_management_action(admin_id, admin_username, action, target_user_id, target_username, details=None):
    """
    Convenience function for logging user management actions
    """
    return log_user_activity(
        user_id=admin_id,
        username=admin_username,
        action=action,
        resource_type=ResourceType.USER,
        resource_id=target_user_id,
        resource_name=target_username,
        details=details
    )

def log_execution_action(user_id, username, action, execution_id, mop_name, details=None):
    """
    Convenience function for logging execution-related actions
    """
    return log_user_activity(
        user_id=user_id,
        username=username,
        action=action,
        resource_type=ResourceType.EXECUTION,
        resource_id=execution_id,
        resource_name=f"Execution of {mop_name}",
        details=details
    )

def log_file_action(user_id, username, action, file_id, filename, details=None):
    """
    Convenience function for logging file-related actions
    """
    return log_user_activity(
        user_id=user_id,
        username=username,
        action=action,
        resource_type=ResourceType.FILE,
        resource_id=file_id,
        resource_name=filename,
        details=details
    )

def log_auth_action(user_id, username, action, details=None):
    """
    Convenience function for logging authentication actions
    """
    return log_user_activity(
        user_id=user_id,
        username=username,
        action=action,
        resource_type=ResourceType.SYSTEM,
        details=details
    )