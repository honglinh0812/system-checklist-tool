"""bootstrap placeholder revision

Revision ID: 5e0606c06fea
Revises: 
Create Date: 2025-08-08 12:00:00.000000

This is a placeholder to bridge an existing database stamped with
revision '5e0606c06fea' to the current migration chain.
It intentionally performs no schema changes.
"""

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision = '5e0606c06fea'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # No-op: placeholder
    pass


def downgrade():
    # No-op: placeholder
    pass


