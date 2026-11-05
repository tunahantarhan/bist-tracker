"""watchlist unique (user_id, symbol)

Revision ID: b7c1d2e3f4a5
Revises: 11a6e7f224ab
Create Date: 2026-11-05

"""
from typing import Sequence, Union

from alembic import op

revision: str = "b7c1d2e3f4a5"
down_revision: Union[str, None] = "11a6e7f224ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove duplicates left by earlier double-click races, keeping the oldest row
    op.execute(
        """
        DELETE FROM watchlists a
        USING watchlists b
        WHERE a.user_id = b.user_id AND a.symbol = b.symbol AND a.id > b.id
        """
    )
    op.create_unique_constraint("uq_watchlists_user_symbol", "watchlists", ["user_id", "symbol"])


def downgrade() -> None:
    op.drop_constraint("uq_watchlists_user_symbol", "watchlists", type_="unique")
