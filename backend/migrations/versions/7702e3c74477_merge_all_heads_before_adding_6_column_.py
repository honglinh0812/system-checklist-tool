"""Merge all heads before adding 6-column format fields

Revision ID: 7702e3c74477
Revises: 82d52a1c00ca, c2d6b347c339, d52bfdd4e772, eb99798ab8dc
Create Date: 2025-08-29 10:19:10.302220

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7702e3c74477'
down_revision = ('82d52a1c00ca', 'c2d6b347c339', 'd52bfdd4e772', 'eb99798ab8dc')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
