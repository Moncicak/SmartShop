"""add_last_ordered_at_to_shopping_list

Revision ID: a3c1f7e9b2d4
Revises: 39f1d90d41bf
Create Date: 2026-06-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3c1f7e9b2d4'
down_revision: Union[str, None] = '39f1d90d41bf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'shopping_lists',
        sa.Column('last_ordered_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('shopping_lists', 'last_ordered_at')
