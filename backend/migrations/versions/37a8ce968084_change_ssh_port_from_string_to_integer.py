"""change_ssh_port_from_string_to_integer

Revision ID: 37a8ce968084
Revises: 95ce388141f0
Create Date: 2025-09-10 09:08:07.881206

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '37a8ce968084'
down_revision = '95ce388141f0'
branch_labels = None
depends_on = None


def upgrade():
    # Convert ssh_port from String to Integer
    # First, update any non-numeric values to default port 22
    op.execute("UPDATE servers SET ssh_port = '22' WHERE ssh_port !~ '^[0-9]+$' OR ssh_port IS NULL")
    
    # Add new integer column
    op.add_column('servers', sa.Column('ssh_port_new', sa.Integer(), nullable=True))
    
    # Copy data from string column to integer column
    op.execute("UPDATE servers SET ssh_port_new = CAST(ssh_port AS INTEGER)")
    
    # Set default value for new column
    op.execute("UPDATE servers SET ssh_port_new = 22 WHERE ssh_port_new IS NULL")
    
    # Drop old column
    op.drop_column('servers', 'ssh_port')
    
    # Rename new column to original name
    op.alter_column('servers', 'ssh_port_new', new_column_name='ssh_port')
    
    # Add not null constraint and default value
    op.alter_column('servers', 'ssh_port', nullable=False, server_default='22')


def downgrade():
    # Convert ssh_port back from Integer to String
    # Add new string column
    op.add_column('servers', sa.Column('ssh_port_new', sa.String(10), nullable=True))
    
    # Copy data from integer column to string column
    op.execute("UPDATE servers SET ssh_port_new = CAST(ssh_port AS VARCHAR)")
    
    # Drop old column
    op.drop_column('servers', 'ssh_port')
    
    # Rename new column to original name
    op.alter_column('servers', 'ssh_port_new', new_column_name='ssh_port')
    
    # Set default value
    op.alter_column('servers', 'ssh_port', server_default='22')
