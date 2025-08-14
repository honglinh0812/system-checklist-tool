"""add_mop_status_constraint

Revision ID: eadfe5149770
Revises: 406f0fe8e749
Create Date: 2025-08-13 11:27:37.147272

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'eadfe5149770'
down_revision = '406f0fe8e749'
branch_labels = None
depends_on = None


def upgrade():
    # Add check constraint to ensure MOP status is only 'approved' or 'pending'
    op.create_check_constraint(
        'ck_mop_status_valid',
        'mops',
        "status IN ('approved', 'pending')"
    )


def downgrade():
    # Remove the check constraint
    op.drop_constraint('ck_mop_status_valid', 'mops', type_='check')
