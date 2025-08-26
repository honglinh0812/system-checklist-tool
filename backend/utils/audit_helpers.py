from models.audit_log import UserActivityLog, ActionType, ResourceType
from models import db
from flask import request
import logging

logger = logging.getLogger(__name__)

def log_user_management_action(admin_id, admin_username, action, target_user_id, target_username, details=None):
    """Log user management actions to audit log"""
    try:
        # Map action strings to ActionType enum
        action_mapping = {
            'create': ActionType.CREATE,
            'update': ActionType.UPDATE,
            'delete': ActionType.DELETE,
            'deactivate': ActionType.DELETE,  # Treat deactivate as delete for logging
            'approve': ActionType.APPROVE,
            'reject': ActionType.REJECT
        }
        
        action_type = action_mapping.get(action.lower(), ActionType.UPDATE)
        
        # Get request info if available
        ip_address = None
        user_agent = None
        if request:
            ip_address = request.remote_addr
            user_agent = request.headers.get('User-Agent')
        
        # Create audit log entry
        UserActivityLog.log_action(
            user_id=admin_id,
            username=admin_username,
            action=action_type,
            resource_type=ResourceType.USER,
            resource_id=target_user_id,
            resource_name=target_username,
            details={
                'action': action,
                'target_user_id': target_user_id,
                'target_username': target_username,
                'details': details
            },
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        logger.info(f"User management action logged: {action} on user {target_username} by {admin_username}")
        
    except Exception as e:
        logger.error(f"Failed to log user management action: {str(e)}")

def log_mop_action(user_id, username, action, mop_id, mop_name, details=None, old_status=None, new_status=None):
    """Log MOP actions to audit log"""
    try:
        # Get request info if available
        ip_address = None
        user_agent = None
        if request:
            ip_address = request.remote_addr
            user_agent = request.headers.get('User-Agent')
        
        # Prepare details
        log_details = details or {}
        if old_status:
            log_details['old_status'] = old_status
        if new_status:
            log_details['new_status'] = new_status
        
        # Create audit log entry
        UserActivityLog.log_action(
            user_id=user_id,
            username=username,
            action=action,
            resource_type=ResourceType.MOP,
            resource_id=mop_id,
            resource_name=mop_name,
            details=log_details,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        logger.info(f"MOP action logged: {action.value} on MOP {mop_name} by {username}")
        
    except Exception as e:
        logger.error(f"Failed to log MOP action: {str(e)}")

def log_user_activity(user_id, username, action, resource_type, resource_id, resource_name, details=None):
    """Log user activity to audit log - compatible with old audit_logger"""
    try:
        # Get request info if available
        ip_address = None
        user_agent = None
        if request:
            ip_address = request.remote_addr
            user_agent = request.headers.get('User-Agent')
        
        # Create audit log entry
        UserActivityLog.log_action(
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
        
        logger.info(f"User activity logged: {action.value} on {resource_type.value} {resource_name} by {username}")
        
    except Exception as e:
        logger.error(f"Failed to log user activity: {str(e)}")