from flask import Blueprint, request, send_file
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename
from sqlalchemy import or_, desc
from datetime import datetime, timedelta, timezone
import os

# GMT+7 timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))
from models.mop import MOP, Command, MOPFile, MOPReview, MOPStatus
from models.user import User
from models import db
from models.audit_log import ActionType, ResourceType
from .api_utils import (
    api_response, api_error, paginate_query, validate_json,
    get_request_filters, apply_filters, require_role
)
from core.schemas import (
    MOPSchema, CommandSchema
)
from core.auth import get_current_user
from utils.audit_helpers import log_mop_action
import logging

logger = logging.getLogger(__name__)

mops_bp = Blueprint('mops', __name__, url_prefix='/api/mops')

@mops_bp.route('', methods=['GET'])
@jwt_required()
def get_mops():
    """Get paginated list of MOPs with filtering"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        # Get filter parameters
        filters = get_request_filters()
        
        # Build base query - show different MOPs based on context
        # For assessment pages, show all approved MOPs
        # For management pages, apply role-based filtering
        assessment_context = request.args.get('context') == 'assessment'
        
        if assessment_context:
            # For assessment context, show all approved MOPs
            query = MOP.query.filter(MOP.status == MOPStatus.APPROVED.value)
        else:
            # For management context, apply role-based filtering
            query = MOP.query.filter(MOP.status.in_([MOPStatus.APPROVED.value, MOPStatus.PENDING.value, MOPStatus.CREATED.value, MOPStatus.EDITED.value]))
            if current_user.role == 'user':
                # Users can only see their own MOPs
                query = query.filter(MOP.created_by == current_user.id)
        
        # Apply search filter
        if filters.get('search'):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                or_(
                    MOP.name.ilike(search_term),
                    MOP.description.ilike(search_term)
                )
            )
        
        # Apply status filter
        if filters.get('status'):
            query = query.filter(MOP.status == filters['status'])
        
        # Apply category filter
        category = request.args.get('category')
        if category:
            query = query.filter(MOP.category == category)
        
        # Apply priority filter
        priority = request.args.get('priority')
        if priority:
            query = query.filter(MOP.priority == priority)
        
        # Apply risk level filter
        risk_level = request.args.get('risk_level')
        if risk_level:
            query = query.filter(MOP.risk_level == risk_level)
        
        # Apply date range filter
        if filters.get('date_from'):
            query = query.filter(MOP.created_at >= filters['date_from'])
        if filters.get('date_to'):
            query = query.filter(MOP.created_at <= filters['date_to'])
        
        # Apply sorting
        sort_by = filters.get('sort_by', 'created_at')
        sort_order = filters.get('sort_order', 'desc')
        
        if hasattr(MOP, sort_by):
            column = getattr(MOP, sort_by)
            if sort_order.lower() == 'desc':
                query = query.order_by(column.desc())
            else:
                query = query.order_by(column.asc())
        
        # Paginate
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        
        result = paginate_query(query, page, per_page)
        
        # Serialize MOPs
        mop_schema = MOPSchema(many=True)
        mops_data = mop_schema.dump(result['items'])
        
        return api_response({
            'mops': mops_data,
            'pagination': result['pagination']
        })
        
    except Exception as e:
        logger.error(f"Get MOPs error: {str(e)}")
        return api_error('Failed to fetch MOPs', 500)

@mops_bp.route('/<int:mop_id>', methods=['GET'])
@jwt_required()
def get_mop(mop_id):
    """Get MOP details by ID"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        mop_schema = MOPSchema()
        mop_data = mop_schema.dump(mop)
        
        # Add commands
        command_schema = CommandSchema(many=True)
        mop_data['commands'] = command_schema.dump(mop.commands)
        
        # Add files info
        pdf_files = [f for f in mop.files if f.file_type == 'pdf']
        appendix_files = [f for f in mop.files if f.file_type == 'appendix']
        mop_data['files'] = {
            'pdf': len(pdf_files) > 0,
            'appendix': len(appendix_files) > 0
        }
        
        # Add review history
        reviews = MOPReview.query.filter_by(mop_id=mop_id).order_by(desc(MOPReview.reviewed_at)).all()
        mop_data['reviews'] = [{
            'id': review.id,
            'status': review.status,
            'reject_reason': review.reject_reason,
            'reviewed_at': review.reviewed_at.isoformat(),
            'admin_id': review.admin_id
        } for review in reviews]
        
        return api_response(mop_data)
        
    except Exception as e:
        logger.error(f"Get MOP error: {str(e)}")
        return api_error('Failed to fetch MOP', 500)

@mops_bp.route('', methods=['POST'])
@jwt_required()
def create_mop():
    """Create a new MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        # Basic validation for required fields from schema
        required_fields = ['name', 'type']
        for field in required_fields:
            if field not in json_data:
                return api_error(f'Missing required field: {field}', 400)
        
        data = json_data
        
        # Create new MOP with only schema-supported fields
        mop = MOP(
            name=data['name'],
            description=data.get('description', ''),
            type=data['type'],
            assessment_type=data.get('assessment_type', 'handover_assessment'),  # Add assessment_type handling
            category='general',  # Default value since not in schema
            priority='medium',   # Default value since not in schema
            estimated_duration=60,  # Default value since not in schema
            risk_level='low',    # Default value since not in schema
            prerequisites='',
            rollback_plan='',
            created_by=current_user.id,
            status=MOPStatus.CREATED.value
        )
        
        db.session.add(mop)
        db.session.commit()
        
        # Log the creation action
        log_mop_action(
            user_id=current_user.id,
            username=current_user.username,
            action=ActionType.CREATE,
            mop_id=mop.id,
            mop_name=mop.name,
            details={
                'type': mop.type,
                'description': mop.description[:100] if mop.description else None
            }
        )
        
        mop_schema = MOPSchema()
        mop_data = mop_schema.dump(mop)
        
        logger.info(f"MOP created: {mop.name} by {current_user.username}")
        
        return api_response(mop_data, 'MOP created successfully', 201)
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Create MOP error: {str(e)}")
        return api_error('Failed to create MOP', 500)

@mops_bp.route('/<int:mop_id>', methods=['PUT'])
@jwt_required()
def update_mop(mop_id):
    """Update MOP details"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        logger.info(f"Updating MOP {mop_id} with data: {json_data}")
        
        # Validate input data using schema
        from core.schemas import MOPUpdateSchema
        schema = MOPUpdateSchema()
        try:
            data = schema.load(json_data)
            logger.info(f"Validation passed for MOP {mop_id}, data: {data}")
        except Exception as e:
            logger.error(f"Validation error for MOP {mop_id}: {str(e)}")
            logger.error(f"Input data: {json_data}")
            return api_error(f'Invalid data: {str(e)}', 400)
        
        # Track changes for audit log
        changes = {}
        old_values = {}
        
        # Update MOP fields - only allow schema-supported fields
        allowed_fields = ['name', 'description', 'type']
        for field in allowed_fields:
            if field in data and data[field] is not None:
                new_value = data[field]
                # Ensure type is always an array
                if field == 'type' and isinstance(new_value, list) and len(new_value) > 0:
                    new_value = [str(item) for item in new_value if item]
                
                old_value = getattr(mop, field)
                if old_value != new_value:
                    old_values[field] = old_value
                    changes[field] = new_value
                    setattr(mop, field, new_value)
        
        # Update timestamp
        mop.updated_at = datetime.now(GMT_PLUS_7)
        
        db.session.commit()
        
        # Log the update action if there were changes
        if changes:
            log_mop_action(
                user_id=current_user.id,
                username=current_user.username,
                action=ActionType.UPDATE,
                mop_id=mop.id,
                mop_name=mop.name,
                details={
                    'changes': changes,
                    'old_values': old_values
                }
            )
        
        mop_schema = MOPSchema()
        mop_data = mop_schema.dump(mop)
        
        logger.info(f"MOP updated: {mop.name} by {current_user.username}")
        
        return api_response(mop_data, 'MOP updated successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Update MOP error: {str(e)}")
        error_message = f"Failed to update MOP: {str(e)}"
        return api_error(error_message, 500)

@mops_bp.route('/<int:mop_id>', methods=['DELETE'])
@jwt_required()
def delete_mop(mop_id):
    """Delete MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        # Check permissions
        if current_user.role != 'admin' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        # Check if MOP can be deleted
        if mop.status in ['in_progress', 'completed']:
            return api_error('Cannot delete MOP in current status', 400)
        
        # Delete associated files
        for mop_file in mop.files:
            try:
                if mop_file.file_path and os.path.exists(mop_file.file_path):
                    os.remove(mop_file.file_path)
            except OSError:
                pass
        
        mop_name = mop.name
        
        # Log the deletion action before deleting
        log_mop_action(
            user_id=current_user.id,
            username=current_user.username,
            action=ActionType.DELETE,
            mop_id=mop.id,
            mop_name=mop_name,
            details={
                'status': mop.status,
                'type': mop.type,
                'deleted_by_role': current_user.role
            }
        )
        
        db.session.delete(mop)
        db.session.commit()
        
        logger.info(f"MOP deleted: {mop_name} by {current_user.username}")
        
        return api_response(None, 'MOP deleted successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Delete MOP error: {str(e)}")
        return api_error('Failed to delete MOP', 500)

@mops_bp.route('/<int:mop_id>/commands', methods=['GET'])
@jwt_required()
def get_mop_commands(mop_id):
    """Get commands for a specific MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        commands = Command.query.filter_by(mop_id=mop_id).order_by(Command.order_index).all()
        
        command_schema = CommandSchema(many=True)
        commands_data = command_schema.dump(commands)
        
        return api_response({
            'commands': commands_data,
            'total': len(commands)
        })
        
    except Exception as e:
        logger.error(f"Get MOP commands error: {str(e)}")
        return api_error('Failed to fetch commands', 500)

@mops_bp.route('/<int:mop_id>/commands/bulk', methods=['POST'])
@jwt_required()
def add_mop_commands_bulk(mop_id):
    """Add multiple commands to MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        # Check if MOP can be edited
        # Allow editing commands for approved MOPs, but not for in_progress or completed
        if mop.status in ['in_progress', 'completed']:
            return api_error('Cannot edit MOP in current status', 400)
        
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        commands_data = json_data.get('commands', [])
        if not commands_data:
            return api_error('No commands provided', 400)
        
        # Clear existing commands first
        Command.query.filter_by(mop_id=mop_id).delete()
        
        created_commands = []
        for idx, cmd_data in enumerate(commands_data):
            # Map frontend fields to backend fields
            command = Command(
                mop_id=mop_id,
                command_id_ref=cmd_data.get('command_id_ref', ''),
                title=cmd_data.get('title', cmd_data.get('description', '')),
                command=cmd_data.get('command', cmd_data.get('command_text', '')),
                command_text=cmd_data.get('command', cmd_data.get('command_text', '')),
                description=cmd_data.get('title', cmd_data.get('description', '')),
                extract_method=cmd_data.get('extract_method', ''),
                comparator_method=cmd_data.get('comparator_method', ''),
                reference_value=cmd_data.get('reference_value', ''),
                order_index=idx + 1,
                is_critical=cmd_data.get('is_critical', False),
                timeout_seconds=cmd_data.get('timeout_seconds'),
                expected_output=cmd_data.get('expected_output', ''),
                rollback_command=cmd_data.get('rollback_command', '')
            )
            db.session.add(command)
            created_commands.append(command)
        
        db.session.commit()
        
        command_schema = CommandSchema(many=True)
        commands_data = command_schema.dump(created_commands)
        
        logger.info(f"Bulk commands added to MOP {mop.name} by {current_user.username}")
        
        return api_response(commands_data, f'{len(created_commands)} commands added successfully', 201)
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding bulk commands to MOP {mop_id}: {str(e)}")
        return api_error('Failed to add commands', 500)

@mops_bp.route('/<int:mop_id>/commands', methods=['POST'])
@jwt_required()
def add_mop_command(mop_id):
    """Add command to MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        # Check if MOP can be edited
        # Allow editing commands for approved MOPs, but not for in_progress or completed
        if mop.status in ['in_progress', 'completed']:
            return api_error('Cannot edit MOP in current status', 400)
        
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        # Basic validation for required fields from CommandSchema
        required_fields = ['command_text', 'order_index']
        for field in required_fields:
            if field not in json_data:
                return api_error(f'Missing required field: {field}', 400)
        
        data = json_data
        
        # Create new command with only schema-supported fields
        command = Command(
            mop_id=mop_id,
            command_text=data['command_text'],
            description=data.get('description', ''),
            order_index=data['order_index'],
            is_critical=data.get('is_critical', False),
            timeout_seconds=data.get('timeout_seconds'),
            expected_output=data.get('expected_output', ''),
            rollback_command=data.get('rollback_command', '')
        )
        
        db.session.add(command)
        db.session.commit()
        
        command_schema = CommandSchema()
        command_data = command_schema.dump(command)
        
        logger.info(f"Command added to MOP {mop.name} by {current_user.username}")
        
        return api_response(command_data, 'Command added successfully', 201)
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Add commands error: {str(e)}")
        error_message = f"Failed to add commands: {str(e)}"
        return api_error(error_message, 500)

@mops_bp.route('/<int:mop_id>/commands/<int:command_id>', methods=['PUT'])
@jwt_required()
def update_mop_command(mop_id, command_id):
    """Update MOP command"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        command = Command.query.filter_by(id=command_id, mop_id=mop_id).first()
        if not command:
            return api_error('Command not found', 404)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        # Check if MOP can be edited
        # Allow editing commands for approved MOPs, but not for in_progress or completed
        if mop.status in ['in_progress', 'completed']:
            return api_error('Cannot edit MOP in current status', 400)
        
        json_data = request.get_json()
        if not json_data:
            return api_error('No JSON data provided', 400)
        
        data = json_data
        
        # Update command fields
        for field, value in data.items():
            if hasattr(command, field):
                setattr(command, field, value)
        
        db.session.commit()
        
        command_schema = CommandSchema()
        command_data = command_schema.dump(command)
        
        logger.info(f"Command updated in MOP {mop.name} by {current_user.username}")
        
        return api_response(command_data, 'Command updated successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Update command error: {str(e)}")
        return api_error('Failed to update command', 500)

@mops_bp.route('/<int:mop_id>/commands/<int:command_id>', methods=['DELETE'])
@jwt_required()
def delete_mop_command(mop_id, command_id):
    """Delete MOP command"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        command = Command.query.filter_by(id=command_id, mop_id=mop_id).first()
        if not command:
            return api_error('Command not found', 404)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        # Check if MOP can be edited
        # Allow editing commands for approved MOPs, but not for in_progress or completed
        if mop.status in ['in_progress', 'completed']:
            return api_error('Cannot edit MOP in current status', 400)
        
        db.session.delete(command)
        db.session.commit()
        
        logger.info(f"Command deleted from MOP {mop.name} by {current_user.username}")
        
        return api_response(None, 'Command deleted successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Delete command error: {str(e)}")
        return api_error('Failed to delete command', 500)

@mops_bp.route('/<int:mop_id>/review', methods=['POST'])
@require_role('admin')
def review_mop(mop_id):
    """Review MOP (approve/reject)"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        if mop.status != MOPStatus.PENDING.value:
            return api_error('MOP is not pending review', 400)
        
        data = request.validated_json
        action = data['action']
        comments = data['comments']
        
        # Create review record
        review = MOPReview(
            mop_id=mop_id,
            admin_id=current_user.id,
            status=action + 'd',  # 'approved' or 'rejected'
            reject_reason=comments if action == 'reject' else None
        )
        
        # Update MOP status
        if action == 'approve':
            mop.status = MOPStatus.APPROVED.value
            mop.approved_by = current_user.id
            mop.approved_at = datetime.now(GMT_PLUS_7)
        else:  
            db.session.delete(mop)
            db.session.commit()
            logger.info(f"MOP {action}d: {mop.name} by reviewer {current_user.username}")
            return api_response(None, f'MOP {action}d successfully')
        
        db.session.add(review)
        db.session.commit()
        
        logger.info(f"MOP {action}d: {mop.name} by reviewer {current_user.username}")
        
        return api_response(None, f'MOP {action}d successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Review MOP error: {str(e)}")
        return api_error('Failed to review MOP', 500)

@mops_bp.route('/<int:mop_id>/submit', methods=['POST'])
@jwt_required()
def submit_mop_for_review(mop_id):
    """Submit MOP for review"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get(mop_id)
        if not mop:
            return api_error('MOP not found', 404)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Insufficient permissions', 403)
        
        if mop.status != 'pending':
            return api_error('Only pending MOPs can be submitted for review', 400)
        
        # Validate MOP has required data
        if not mop.commands:
            return api_error('MOP must have at least one command', 400)
        
        # MOP is already pending, just update submitted timestamp
        mop.submitted_at = datetime.now(GMT_PLUS_7)
        db.session.commit()
        
        logger.info(f"MOP submitted for review: {mop.name} by {current_user.username}")
        
        return api_response(None, 'MOP submitted for review successfully')
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Submit MOP error: {str(e)}")
        return api_error('Failed to submit MOP for review', 500)

@mops_bp.route('/validate', methods=['POST'])
@jwt_required()
def validate_mop():
    """Validate MOP data"""
    try:
        data = request.get_json()
        if not data:
            return api_error('No data provided', 400)
        
        # Basic validation
        errors = []
        
        if not data.get('name'):
            errors.append('MOP name is required')
        
        if not data.get('commands') or len(data.get('commands', [])) == 0:
            errors.append('At least one command is required')
        
        # Validate commands
        commands = data.get('commands', [])
        for i, cmd in enumerate(commands):
            if not cmd.get('title'):
                errors.append(f'Command {i+1}: Title is required')
            if not cmd.get('command'):
                errors.append(f'Command {i+1}: Command is required')
        
        if errors:
            return api_response({'errors': errors}, 'Validation failed', success=False)
        
        return api_response(None, 'MOP validation successful')
        
    except Exception as e:
        logger.error(f"Validate MOP error: {str(e)}")
        return api_error('Failed to validate MOP', 500)

@mops_bp.route('/pending', methods=['GET'])
@require_role('admin')
def get_pending_mops():
    """Get MOPs pending review"""
    try:
        # Get filter parameters
        filters = get_request_filters()
        
        # Build query for pending MOPs
        query = MOP.query.filter_by(status=MOPStatus.PENDING)
        
        # Apply search filter
        if filters.get('search'):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                or_(
                    MOP.name.ilike(search_term),
                    MOP.description.ilike(search_term)
                )
            )
        
        # Apply sorting
        sort_by = filters.get('sort_by', 'submitted_at')
        sort_order = filters.get('sort_order', 'desc')
        
        if hasattr(MOP, sort_by):
            column = getattr(MOP, sort_by)
            if sort_order.lower() == 'desc':
                query = query.order_by(column.desc())
            else:
                query = query.order_by(column.asc())
        
        # Paginate
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        
        result = paginate_query(query, page, per_page)
        
        # Serialize MOPs
        mop_schema = MOPSchema(many=True)
        mops_data = mop_schema.dump(result['items'])
        
        return api_response({
            'mops': mops_data,
            'pagination': result['pagination']
        })
        
    except Exception as e:
        logger.error(f"Get pending MOPs error: {str(e)}")
        return api_error('Failed to fetch pending MOPs', 500)


@mops_bp.route('/review', methods=['GET'])
@require_role('admin')
def get_review_mops():
    """Get all MOPs except approved for review"""
    try:
        # Get filter parameters
        filters = get_request_filters()
        
        # Build query for pending MOPs only
        query = MOP.query.filter_by(status=MOPStatus.PENDING.value)
        
        # Apply search filter
        if filters.get('search'):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                or_(
                    MOP.name.ilike(search_term),
                    MOP.description.ilike(search_term)
                )
            )
        
        # Apply status filter if provided
        if filters.get('status'):
            query = query.filter(MOP.status == filters['status'])
        
        # Apply sorting
        sort_by = filters.get('sort_by', 'created_at')
        sort_order = filters.get('sort_order', 'desc')
        
        if hasattr(MOP, sort_by):
            column = getattr(MOP, sort_by)
            if sort_order.lower() == 'desc':
                query = query.order_by(column.desc())
            else:
                query = query.order_by(column.asc())
        
        # Paginate
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        
        result = paginate_query(query, page, per_page)
        
        # Serialize MOPs
        mop_schema = MOPSchema(many=True)
        mops_data = mop_schema.dump(result['items'])
        
        return api_response({
            'mops': mops_data,
            'pagination': result['pagination']
        })
        
    except Exception as e:
        logger.error(f"Get review MOPs error: {str(e)}")
        return api_error('Failed to fetch review MOPs', 500)

@mops_bp.route('/<int:mop_id>/approve', methods=['POST'])
@require_role('admin')
def approve_mop(mop_id):
    """Approve a MOP"""
    try:
        logger.info(f"Starting approval process for MOP {mop_id}")
        current_user = get_current_user()
        if not current_user:
            logger.error(f"User not found for MOP {mop_id} approval")
            return api_error('User not found', 404)
        
        logger.info(f"User {current_user.id} attempting to approve MOP {mop_id}")
        mop = MOP.query.get_or_404(mop_id)
        
        logger.info(f"MOP {mop_id} current status: {mop.status}")
        if mop.status != MOPStatus.PENDING.value:
            logger.error(f"MOP {mop_id} is not pending review, current status: {mop.status}")
            return api_error('MOP is not pending review', 400)
        
        # Update MOP status
        mop.status = MOPStatus.APPROVED.value
        mop.approved_by = current_user.id
        mop.approved_at = datetime.utcnow()
        
        # Create review record
        request_data = request.get_json() or {}
        review = MOPReview(
            mop_id=mop_id,
            admin_id=current_user.id,
            status='approved',
            reject_reason=request_data.get('comments', ''),
            reviewed_at=datetime.now(GMT_PLUS_7)
        )
        
        db.session.add(review)
        db.session.commit()
        
        # Log the approval action
        log_mop_action(
            user_id=current_user.id,
            username=current_user.username,
            action=ActionType.APPROVE,
            mop_id=mop.id,
            mop_name=mop.name,
            details={
                'comments': request_data.get('comments', ''),
                'previous_status': MOPStatus.PENDING.value,
                'new_status': MOPStatus.APPROVED.value
            }
        )
        
        logger.info(f"MOP {mop_id} approved by user {current_user.id}")
        
        return api_response({
            'message': 'MOP approved successfully',
            'mop_id': mop_id,
            'status': mop.status
        })
        
    except Exception as e:
        logger.error(f"Error approving MOP {mop_id}: {str(e)}")
        db.session.rollback()
        return api_error('Failed to approve MOP', 500)

@mops_bp.route('/<int:mop_id>/reject', methods=['POST'])
@require_role('admin')
def reject_mop(mop_id):
    """Reject a MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get_or_404(mop_id)
        
        if mop.status != MOPStatus.PENDING.value:
            return api_error('MOP is not pending review', 400)
        
        request_data = request.get_json() or {}
        comments = request_data.get('comments', '')
        if not comments:
            return api_error('Comments are required for rejection', 400)
        
        # Log the rejection action before deletion
        log_mop_action(
            user_id=current_user.id,
            username=current_user.username,
            action=ActionType.REJECT,
            mop_id=mop.id,
            mop_name=mop.name,
            details={
                'comments': comments,
                'previous_status': MOPStatus.PENDING.value,
                'action_taken': 'deleted'
            }
        )
        
        # Delete rejected MOP completely
        # First delete all related records
        MOPReview.query.filter_by(mop_id=mop_id).delete()
        
        # Delete the MOP (cascade will handle commands, files, etc.)
        db.session.delete(mop)
        db.session.commit()
        
        logger.info(f"MOP {mop_id} rejected by user {current_user.id}")
        
        return api_response({
            'message': 'MOP rejected successfully',
            'mop_id': mop_id,
            'status': MOPStatus.PENDING.value,
            'comments': comments
        })
        
    except Exception as e:
        logger.error(f"Error rejecting MOP {mop_id}: {str(e)}")
        db.session.rollback()
        return api_error('Failed to reject MOP', 500)

@mops_bp.route('/<int:mop_id>/reviews', methods=['GET'])
@jwt_required()
def get_mop_reviews(mop_id):
    """Get review history for a MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get_or_404(mop_id)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        reviews = MOPReview.query.filter_by(mop_id=mop_id).order_by(desc(MOPReview.reviewed_at)).all()
        
        reviews_data = []
        for review in reviews:
            reviewer = db.session.get(User, review.admin_id)
            reviews_data.append({
                'id': review.id,
                'status': review.status,
                'reject_reason': review.reject_reason,
                'reviewed_at': review.reviewed_at.isoformat(),
                'reviewer': {
                    'id': reviewer.id,
                    'username': reviewer.username,
                    'full_name': reviewer.full_name
                } if reviewer else None
            })
        
        return api_response({
            'reviews': reviews_data,
            'total': len(reviews_data)
        })
        
    except Exception as e:
        logger.error(f"Error fetching reviews for MOP {mop_id}: {str(e)}")
        return api_error('Failed to fetch reviews', 500)

@mops_bp.route('/<int:mop_id>/files', methods=['POST'])
@jwt_required()
def upload_mop_files(mop_id):
    """Upload files for a MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get_or_404(mop_id)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        if 'file' not in request.files:
            return api_error('No file provided', 400)
        
        file = request.files['file']
        if file.filename == '':
            return api_error('No file selected', 400)
        
        # Validate file type
        allowed_extensions = {'txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'}
        if not ('.' in file.filename and file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
            return api_error('File type not allowed', 400)
        
        # Secure filename
        filename = secure_filename(file.filename)
        
        # Create upload directory if not exists
        upload_dir = os.path.join('uploads', 'mops', str(mop_id))
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save file
        file_path = os.path.join(upload_dir, filename)
        file.save(file_path)
        
        # Create file record
        mop_file = MOPFile(
            mop_id=mop_id,
            filename=filename,
            file_path=file_path,
            file_size=os.path.getsize(file_path),
            uploaded_by=current_user.id,
            uploaded_at=datetime.now(GMT_PLUS_7)
        )
        
        db.session.add(mop_file)
        db.session.commit()
        
        logger.info(f"File {filename} uploaded for MOP {mop_id} by user {current_user.id}")
        
        return api_response({
            'message': 'File uploaded successfully',
            'file': {
                'id': mop_file.id,
                'filename': filename,
                'file_size': mop_file.file_size,
                'uploaded_at': mop_file.uploaded_at.isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Error uploading file for MOP {mop_id}: {str(e)}")
        db.session.rollback()
        return api_error('Failed to upload file', 500)

@mops_bp.route('/<int:mop_id>/files', methods=['GET'])
@jwt_required()
def get_mop_files(mop_id):
    """Get files for a MOP"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop = MOP.query.get_or_404(mop_id)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        files = MOPFile.query.filter_by(mop_id=mop_id).all()
        
        files_data = []
        for file in files:
            uploader = db.session.get(User, file.uploaded_by)
            files_data.append({
                'id': file.id,
                'filename': file.filename,
                'file_size': file.file_size,
                'uploaded_at': file.uploaded_at.isoformat(),
                'uploaded_by': {
                    'id': uploader.id,
                    'username': uploader.username,
                    'full_name': uploader.full_name
                } if uploader else None
            })
        
        return api_response({
            'files': files_data,
            'total': len(files_data)
        })
        
    except Exception as e:
        logger.error(f"Error fetching files for MOP {mop_id}: {str(e)}")
        return api_error('Failed to fetch files', 500)

@mops_bp.route('/files/<int:file_id>', methods=['DELETE'])
@jwt_required()
def delete_mop_file(file_id):
    """Delete a MOP file"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop_file = MOPFile.query.get_or_404(file_id)
        mop = MOP.query.get_or_404(mop_file.mop_id)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        # Delete physical file
        if os.path.exists(mop_file.file_path):
            os.remove(mop_file.file_path)
        
        # Delete database record
        db.session.delete(mop_file)
        db.session.commit()
        
        logger.info(f"File {file_id} deleted by user {current_user.id}")
        
        return api_response({
            'message': 'File deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"Error deleting file {file_id}: {str(e)}")
        db.session.rollback()
        return api_error('Failed to delete file', 500)

@mops_bp.route('/<int:mop_id>/files/<string:file_type>', methods=['GET'])
def get_mop_file(mop_id, file_type):
    """Get/view a MOP file by type (pdf or appendix)"""
    try:
        # Check for token in query parameter first, then in header
        token = request.args.get('token')
        if token:
            # Validate token manually
            from flask_jwt_extended import decode_token
            try:
                decoded_token = decode_token(token)
                user_id = decoded_token['sub']
                from models.user import User
                current_user = User.query.get(user_id)
            except Exception as e:
                return api_error('Invalid token', 401)
        else:
            # Use standard JWT authentication
            from flask_jwt_extended import jwt_required, get_current_user as jwt_get_current_user
            jwt_required()(lambda: None)()
            current_user = get_current_user()
        
        if not current_user:
            return api_error('User not found', 404)
        
        # Get MOP and check permissions
        mop = MOP.query.get_or_404(mop_id)
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        # Find file by type
        if file_type == 'pdf':
            mop_file = MOPFile.query.filter_by(mop_id=mop_id, file_type='pdf').first()
        elif file_type == 'appendix':
            # Appendix can be xlsx, xls, csv, txt
            mop_file = MOPFile.query.filter_by(mop_id=mop_id).filter(
                MOPFile.file_type.in_(['xlsx', 'xls', 'csv', 'txt'])
            ).first()
        else:
            return api_error('Invalid file type', 400)
        
        if not mop_file:
            return api_error(f'{file_type.upper()} file not found', 404)
        
        if not os.path.exists(mop_file.file_path):
            return api_error('File not found on disk', 404)
        
        # Check if download is requested
        download = request.args.get('download', 'false').lower() == 'true'
        
        # For PDF files, serve inline for viewing unless download is explicitly requested
        if file_type == 'pdf' and not download:
            return send_file(
                mop_file.file_path,
                as_attachment=False,
                mimetype='application/pdf'
            )
        else:
            # For appendix files or when download is requested, serve as attachment
            return send_file(
                mop_file.file_path,
                as_attachment=True,
                download_name=mop_file.filename
            )
        
    except Exception as e:
        logger.error(f"Error serving file {file_type} for MOP {mop_id}: {str(e)}")
        return api_error('Failed to serve file', 500)

@mops_bp.route('/files/<int:file_id>/download', methods=['GET'])
@jwt_required()
def download_mop_file(file_id):
    """Download a MOP file by file ID"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        mop_file = MOPFile.query.get_or_404(file_id)
        mop = MOP.query.get_or_404(mop_file.mop_id)
        
        # Check permissions
        if current_user.role == 'user' and mop.created_by != current_user.id:
            return api_error('Access denied', 403)
        
        if not os.path.exists(mop_file.file_path):
            return api_error('File not found', 404)
        
        return send_file(
            mop_file.file_path,
            as_attachment=True,
            download_name=mop_file.filename
        )
        
    except Exception as e:
        logger.error(f"Error downloading file {file_id}: {str(e)}")
        return api_error('Failed to download file', 500)

@mops_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_mop():
    """Upload MOP PDF and appendix files"""
    try:
        current_user = get_current_user()
        if not current_user:
            return api_error('User not found', 404)
        
        if 'pdf_file' not in request.files or 'appendix_file' not in request.files:
            return api_error('Both PDF and appendix files are required', 400)
        
        mop_name = request.form.get('mop_name', '')
        if not mop_name:
            return api_error('MOP name is required', 400)
        
        pdf_file = request.files['pdf_file']
        appendix_file = request.files['appendix_file']
        description = request.form.get('description', '')
        assessment_type = request.form.get('assessment_type', 'handover_assessment')
        
        if pdf_file.filename == '' or appendix_file.filename == '':
            return api_error('Both files must be selected', 400)
        
        # Validate file extensions
        if not pdf_file.filename.lower().endswith('.pdf'):
            return api_error('PDF file must have .pdf extension', 400)
        
        appendix_ext = appendix_file.filename.rsplit('.', 1)[1].lower()
        if appendix_ext not in ['xlsx', 'xls', 'csv', 'txt']:
            return api_error('Appendix file must be Excel, CSV, or TXT', 400)
        
        # Validate appendix file structure before saving
        from services.appendix_parser import AppendixParser
        parser = AppendixParser()
        
        is_valid, error_msg = parser.validate_file_before_upload(appendix_file)
        if not is_valid:
            return api_error(f'Invalid appendix file: {error_msg}', 400)
        
        # Save files
        pdf_filename = secure_filename(f"mop_pdf_{datetime.now(GMT_PLUS_7).strftime('%Y%m%d_%H%M%S')}.pdf")
        appendix_filename = secure_filename(f"mop_appendix_{datetime.now(GMT_PLUS_7).strftime('%Y%m%d_%H%M%S')}.{appendix_ext}")
        
        # Create upload directories
        pdf_dir = os.path.join('uploads', 'pdf')
        appendix_dir = os.path.join('uploads', 'appendix')
        os.makedirs(pdf_dir, exist_ok=True)
        os.makedirs(appendix_dir, exist_ok=True)
        
        pdf_path = os.path.join(pdf_dir, pdf_filename)
        appendix_path = os.path.join(appendix_dir, appendix_filename)
        
        pdf_file.save(pdf_path)
        appendix_file.save(appendix_path)
        
        # Parse appendix file to extract commands
        success, commands_data, parse_error = parser.parse_appendix_file(appendix_path)
        if not success:
            # Clean up saved files
            try:
                os.remove(pdf_path)
                os.remove(appendix_path)
            except:
                pass
            return api_error(f'Failed to parse appendix file: {parse_error}', 400)
        
        # Create MOP record
        mop = MOP(
            name=mop_name if mop_name else f"MOP_{datetime.now(GMT_PLUS_7).strftime('%Y%m%d_%H%M%S')}",
            description=description,
            type=[assessment_type],  # Set type to match assessment_type
            status='pending',
            assessment_type=assessment_type,  # Set assessment type from form
            category='uploaded',  # Set default category
            priority='medium',  # Set default priority
            estimated_duration=60,  # Set default duration in minutes
            risk_level='medium',  # Set default risk level
            created_by=current_user.id
        )
        
        db.session.add(mop)
        db.session.flush()
        
        # Create commands from parsed data
        from models.mop import Command
        for cmd_data in commands_data:
            # Extract skip condition data
            skip_condition = cmd_data.get('skip_condition')
            skip_condition_id = None
            skip_condition_type = None
            skip_condition_value = None
            
            if skip_condition:
                skip_condition_id = skip_condition.get('condition_id')
                skip_condition_type = skip_condition.get('condition_type')
                skip_condition_value = skip_condition.get('condition_value')
            
            command = Command(
                mop_id=mop.id,
                # Strict 5-column mapping
                command_text=cmd_data['command_text'],
                description=cmd_data['title'],
                comparator_method=cmd_data.get('comparator_method', ''),
                command_id_ref=cmd_data.get('command_id_ref'),
                reference_value=cmd_data.get('reference_value', ''),
                # Order/flags
                order_index=cmd_data.get('order_index', 0),
                is_critical=cmd_data.get('is_critical', False),
                timeout_seconds=cmd_data.get('timeout_seconds'),
                # Skip condition fields (kept for future use, if provided)
                skip_condition_id=skip_condition_id,
                skip_condition_type=skip_condition_type,
                skip_condition_value=skip_condition_value,
                # Legacy compatibility (optional fill)
                title=cmd_data['title'],
                command=cmd_data['original_command'] if 'original_command' in cmd_data else cmd_data['command_text'],
                expected_output=cmd_data.get('reference_value', '')
            )
            db.session.add(command)
        
        # Create MOP files
        pdf_mop_file = MOPFile(
            mop_id=mop.id,
            filename=pdf_filename,
            file_type='pdf',
            file_path=pdf_path,
            file_size=os.path.getsize(pdf_path),
            uploaded_by=current_user.id
        )
        appendix_mop_file = MOPFile(
            mop_id=mop.id,
            filename=appendix_filename,
            file_type=appendix_ext,
            file_path=appendix_path,
            file_size=os.path.getsize(appendix_path),
            uploaded_by=current_user.id
        )
        
        db.session.add(pdf_mop_file)
        db.session.add(appendix_mop_file)
        db.session.commit()
        
        # Calculate sanitization statistics
        sanitized_commands = [cmd for cmd in commands_data if cmd.get('sanitized', False)]
        sanitization_warnings = []
        for cmd in commands_data:
            if cmd.get('sanitize_warnings'):
                sanitization_warnings.extend(cmd['sanitize_warnings'])
        
        logger.info(f"MOP files uploaded successfully by user {current_user.id}, MOP ID: {mop.id}, Commands: {len(commands_data)}, Sanitized: {len(sanitized_commands)}")
        
        return api_response({
            'message': 'MOP files uploaded successfully',
            'mop_id': mop.id,
            'status': 'pending',
            'commands_count': len(commands_data),
            'sanitization_info': {
                'total_commands': len(commands_data),
                'sanitized_commands': len(sanitized_commands),
                'unchanged_commands': len(commands_data) - len(sanitized_commands),
                'warnings_count': len(sanitization_warnings),
                'has_sanitized_commands': len(sanitized_commands) > 0
            }
        })
        
    except Exception as e:
        logger.error(f"Error uploading MOP files: {str(e)}")
        db.session.rollback()
        return api_error('Failed to upload MOP files', 500)

@mops_bp.route('/template/download', methods=['GET'])
@jwt_required()
def download_template():
    """Download MOP template file"""
    try:
        # Get template type from query parameter (default to 6-column)
        template_type = request.args.get('type', '6-column')
        
        if template_type == '6-column':
            template_path = os.path.join('scripts', 'templates', 'appendix_template_6_column.xlsx')
            download_name = 'appendix_template_6_column.xlsx'
        elif template_type == '3-column':
            # Create 3-column template on the fly if needed
            template_path = os.path.join('templates', 'server_list_template_v2.xlsx')
            download_name = 'server_list_template.xlsx'
        else:
            return api_error('Invalid template type. Use "6-column" or "3-column"', 400)
        
        if not os.path.exists(template_path):
            return api_error('Template file not found', 404)
        
        return send_file(
            template_path,
            as_attachment=True,
            download_name=download_name,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        logger.error(f"Error downloading template: {str(e)}")
        return api_error('Failed to download template', 500)