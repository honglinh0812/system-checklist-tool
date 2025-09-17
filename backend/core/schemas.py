from marshmallow import Schema, fields, validate, validates, ValidationError
from marshmallow_sqlalchemy import SQLAlchemyAutoSchema
from models.user import User
from models.mop import MOP, Command
from models.execution import ExecutionHistory

# Authentication Schemas
class LoginSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=3, max=50))
    password = fields.Str(required=True, validate=validate.Length(min=1))

class RefreshTokenSchema(Schema):
    refresh_token = fields.Str(required=True)

# User Schemas
# Thêm schema cho đăng ký công khai
class PublicRegisterSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=3, max=50))
    password = fields.Str(required=True, validate=validate.Length(min=6))
    email = fields.Email(required=True)
    full_name = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    
    @validates('username')
    def validate_username(self, value):
        if User.query.filter_by(username=value).first():
            raise ValidationError('Username already exists')
    
    @validates('email')
    def validate_email(self, value):
        if User.query.filter_by(email=value).first():
            raise ValidationError('Email already exists')

# Cập nhật UserCreateSchema để hỗ trợ viewer role
class UserCreateSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=3, max=50))
    password = fields.Str(required=True, validate=validate.Length(min=1))
    email = fields.Email(required=True)
    full_name = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    role = fields.Str(required=True, validate=validate.OneOf(['admin', 'user', 'viewer']))
    status = fields.Str(validate=validate.OneOf(['pending', 'active']), missing='active')
    is_default_account = fields.Bool(missing=False)
    
    @validates('username')
    def validate_username(self, value):
        if User.query.filter_by(username=value).first():
            raise ValidationError('Username already exists')

# Cập nhật DefaultUserCreateSchema
class DefaultUserCreateSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=3, max=50))
    password = fields.Str(required=True)
    email = fields.Email(required=True)
    full_name = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    role = fields.Str(required=True, validate=validate.OneOf(['admin', 'user', 'viewer']))
    
    @validates('username')
    def validate_username(self, value):
        if User.query.filter_by(username=value).first():
            raise ValidationError('Username already exists')

# Schema cho approve/reject user
class UserApprovalSchema(Schema):
    action = fields.Str(required=True, validate=validate.OneOf(['approve', 'reject']))
    
class UserSchema(SQLAlchemyAutoSchema):
    class Meta:
        model = User
        load_instance = True
        exclude = ('password_hash',)

# MOP Schemas
class MOPCreateSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    description = fields.Str(required=False)
    type = fields.List(fields.Str(), required=True, validate=validate.Length(min=1))
    
class MOPUpdateSchema(Schema):
    name = fields.Str(validate=validate.Length(min=3, max=200))
    description = fields.Str(missing='', validate=validate.Length(min=0))
    type = fields.List(fields.Str(), validate=validate.Length(min=1))
    status = fields.Str(validate=validate.OneOf([
        'pending', 'approved'
    ]))

class MOPReviewSchema(Schema):
    # Input fields for creating review
    action = fields.Str(required=True, validate=validate.OneOf(['approve', 'reject']))
    comments = fields.Str(required=True, validate=validate.Length(min=10))
    
    # Output fields for displaying review
    id = fields.Int(dump_only=True)
    mop_id = fields.Int(dump_only=True)
    admin_id = fields.Int(dump_only=True)
    status = fields.Str(dump_only=True)
    reject_reason = fields.Str(dump_only=True)
    reviewed_at = fields.DateTime(dump_only=True)

class MOPSchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str()
    description = fields.Str()
    type = fields.List(fields.Str())
    assessment_type = fields.Str()  # Add assessment_type field
    status = fields.Str()
    category = fields.Str()
    priority = fields.Str()
    estimated_duration = fields.Int()
    risk_level = fields.Str()
    prerequisites = fields.Str(allow_none=True)
    rollback_plan = fields.Str(allow_none=True)
    created_by = fields.Nested('UserSchema', dump_only=True, attribute='creator')
    approved_by = fields.Int(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)
    
    # Relationships
    commands = fields.Nested('CommandSchema', many=True, dump_only=True)
    files = fields.Nested('MOPFileSchema', many=True, dump_only=True)
    reviews = fields.Nested('MOPReviewSchema', many=True, dump_only=True)
    executions = fields.Nested('ExecutionSchema', many=True, dump_only=True)
    
    # Aliases for compatibility
    creator = fields.Int(attribute='created_by', dump_only=True)
    approver = fields.Int(attribute='approved_by', dump_only=True)

# MOPFile Schema
class MOPFileSchema(Schema):
    id = fields.Int(dump_only=True)
    mop_id = fields.Int(dump_only=True)
    filename = fields.Str(dump_only=True)
    file_type = fields.Str(dump_only=True)
    file_path = fields.Str(dump_only=True)
    file_size = fields.Int(dump_only=True)
    uploaded_by = fields.Int(dump_only=True)
    uploaded_at = fields.DateTime(dump_only=True)

# Command Schemas
class CommandCreateSchema(Schema):
    command_text = fields.Str(required=True, validate=validate.Length(min=1))
    description = fields.Str(required=True, validate=validate.Length(min=1))
    order_index = fields.Int(required=True, validate=validate.Range(min=0))
    comparator_method = fields.Str(required=False, validate=validate.OneOf([
        'eq', 'neq', 'contains', 'not_contains', 'regex', 'in', 'not_in',
        'int_eq', 'int_ge', 'int_gt', 'int_le', 'int_lt', 'empty', 'non_empty'
    ]))
    reference_value = fields.Str(required=False)
    command_id_ref = fields.Str(required=False)

class CommandUpdateSchema(Schema):
    command_text = fields.Str(validate=validate.Length(min=1))
    description = fields.Str(validate=validate.Length(min=1))
    order_index = fields.Int(validate=validate.Range(min=0))
    comparator_method = fields.Str(validate=validate.OneOf([
        'eq', 'neq', 'contains', 'not_contains', 'regex', 'in', 'not_in',
        'int_eq', 'int_ge', 'int_gt', 'int_le', 'int_lt', 'empty', 'non_empty'
    ]))
    reference_value = fields.Str()
    command_id_ref = fields.Str()

class CommandSchema(SQLAlchemyAutoSchema):
    class Meta:
        model = Command
        load_instance = True

# Server Schemas
class ServerSchema(Schema):
    hostname = fields.Str(required=True, validate=validate.Length(min=1, max=255))
    ip_address = fields.IP(required=True)
    username = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    port = fields.Int(validate=validate.Range(min=1, max=65535), missing=22)
    os_type = fields.Str(validate=validate.OneOf(['linux', 'windows', 'unix']))

# Filter Schemas
class FilterSchema(Schema):
    search = fields.Str()
    status = fields.Str()
    category = fields.Str()
    priority = fields.Str()
    date_from = fields.DateTime()
    date_to = fields.DateTime()
    page = fields.Int(validate=validate.Range(min=1), missing=1)
    per_page = fields.Int(validate=validate.Range(min=1, max=100), missing=20)
    sort_by = fields.Str(missing='id')
    sort_order = fields.Str(validate=validate.OneOf(['asc', 'desc']), missing='asc')

# File Upload Schemas
class FileUploadSchema(Schema):
    file_type = fields.Str(required=True, validate=validate.OneOf(['pdf', 'xls', 'xlsx']))
    description = fields.Str()

# Dashboard Schemas
class DashboardStatsSchema(Schema):
    total_mops = fields.Int()
    pending_reviews = fields.Int()
    active_executions = fields.Int()
    completed_executions = fields.Int()
    recent_activities = fields.List(fields.Dict())

# Export Schemas
class ExportSchema(Schema):
    format = fields.Str(required=True, validate=validate.OneOf(['excel', 'csv', 'pdf']))
    include_details = fields.Bool(missing=True)
    date_range = fields.Str(validate=validate.OneOf(['7d', '30d', '90d', 'all']), missing='30d')

# Execution Schemas
class ExecutionCreateSchema(Schema):
    mop_id = fields.Int(required=True)
    dry_run = fields.Bool(missing=False)
    risk_assessment = fields.Bool(missing=False)
    handover_assessment = fields.Bool(missing=False)

class ExecutionSchema(SQLAlchemyAutoSchema):
    class Meta:
        model = ExecutionHistory
        load_instance = True

# Change Password Schema
class ChangePasswordSchema(Schema):
    current_password = fields.Str(required=True, validate=validate.Length(min=1))
    new_password = fields.Str(required=True, validate=validate.Length(min=1))