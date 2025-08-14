"""Merge multiple heads

Revision ID: 0ee26b6e4a3d
Revises: assessment_results_001, eadfe5149770
Create Date: 2025-08-13 16:10:36.342587

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0ee26b6e4a3d'
down_revision = ('assessment_results_001', 'eadfe5149770')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
