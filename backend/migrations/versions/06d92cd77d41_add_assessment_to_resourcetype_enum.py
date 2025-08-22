"""Add ASSESSMENT to ResourceType enum

Revision ID: 06d92cd77d41
Revises: d00ec0f45d3e
Create Date: 2025-08-22 23:05:48.864742

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '06d92cd77d41'
down_revision = 'd00ec0f45d3e'
branch_labels = None
depends_on = None


def upgrade():
    # Add ASSESSMENT value to ResourceType enum
    op.execute("ALTER TYPE resourcetype ADD VALUE IF NOT EXISTS 'ASSESSMENT'")


def downgrade():
    # Note: Cannot remove enum values in PostgreSQL without recreating the type
    # This is a one-way migration
    pass
