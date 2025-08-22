"""Add extended status for MOP, Assessment and User models

Revision ID: d00ec0f45d3e
Revises: 6b895c71d938
Create Date: 2025-08-22 15:20:13.529536

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd00ec0f45d3e'
down_revision = '6b895c71d938'
branch_labels = None
depends_on = None


def upgrade():
    # Update MOP status enum to include new values
    op.execute("ALTER TYPE mopstatus ADD VALUE IF NOT EXISTS 'created'")
    op.execute("ALTER TYPE mopstatus ADD VALUE IF NOT EXISTS 'edited'")
    op.execute("ALTER TYPE mopstatus ADD VALUE IF NOT EXISTS 'deleted'")
    
    # Update Assessment status to use new enum values
    op.execute("UPDATE assessment_results SET status = 'pending' WHERE status = 'pending'")
    op.execute("UPDATE assessment_results SET status = 'success' WHERE status = 'completed'")
    op.execute("UPDATE assessment_results SET status = 'fail' WHERE status = 'failed'")
    
    # Update User status to use new values
    op.execute("UPDATE users SET status = 'created' WHERE status = 'active'")
    op.execute("UPDATE users SET status = 'pending' WHERE status = 'pending'")
    
    # Update default status for new MOPs
    op.alter_column('mops', 'status', server_default='created')


def downgrade():
    # Revert MOP status changes
    op.alter_column('mops', 'status', server_default='pending')
    
    # Revert User status changes
    op.execute("UPDATE users SET status = 'active' WHERE status = 'created'")
    
    # Revert Assessment status changes
    op.execute("UPDATE assessment_results SET status = 'completed' WHERE status = 'success'")
    op.execute("UPDATE assessment_results SET status = 'failed' WHERE status = 'fail'")
    
    # Note: Cannot remove enum values in PostgreSQL without recreating the type
