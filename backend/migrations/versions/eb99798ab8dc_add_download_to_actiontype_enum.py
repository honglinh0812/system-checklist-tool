"""add_download_to_actiontype_enum

Revision ID: eb99798ab8dc
Revises: 06d92cd77d41
Create Date: 2025-08-22 23:15:37.678617

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'eb99798ab8dc'
down_revision = '06d92cd77d41'
branch_labels = None
depends_on = None


def upgrade():
    # Add DOWNLOAD value to ActionType enum
    op.execute("ALTER TYPE actiontype ADD VALUE IF NOT EXISTS 'DOWNLOAD'")


def downgrade():
    # Note: Cannot remove enum values in PostgreSQL without recreating the type
    # This is a one-way migration
    pass
