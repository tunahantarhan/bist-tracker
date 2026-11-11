"""auth: email verification, token versioning, admin 2FA, last login

Revision ID: c4e8a1f2b9d0
Revises: b7c1d2e3f4a5
Create Date: 2026-11-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4e8a1f2b9d0"
down_revision: Union[str, None] = "b7c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("users", sa.Column("token_version", sa.Integer(), server_default=sa.text("0"), nullable=False))
    op.add_column("users", sa.Column("totp_secret", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("users", sa.Column("totp_last_counter", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_login_ip", sa.String(length=45), nullable=True))
    # Accounts created before verification existed keep working
    op.execute("UPDATE users SET is_verified = true")


def downgrade() -> None:
    for column in (
        "last_login_ip",
        "last_login_at",
        "totp_last_counter",
        "totp_enabled",
        "totp_secret",
        "token_version",
        "is_verified",
    ):
        op.drop_column("users", column)
