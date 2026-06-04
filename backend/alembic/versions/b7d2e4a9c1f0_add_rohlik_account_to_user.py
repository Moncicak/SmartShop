"""add_rohlik_account_to_user

Revision ID: b7d2e4a9c1f0
Revises: a3c1f7e9b2d4
Create Date: 2026-06-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d2e4a9c1f0'
down_revision: Union[str, None] = 'a3c1f7e9b2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('rohlik_email', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('rohlik_password_enc', sa.Text(), nullable=True))
    op.add_column(
        'users',
        sa.Column('rohlik_connected', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('users', 'rohlik_connected')
    op.drop_column('users', 'rohlik_password_enc')
    op.drop_column('users', 'rohlik_email')
