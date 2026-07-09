"""Add active_state and last_heartbeat to interviews for session persistence.

Revision ID: 002_session_persist
Revises: 001_initial
Create Date: 2025-01-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002_session_persist"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add session persistence columns to interviews table."""
    op.add_column("interviews", sa.Column("active_state", sa.JSON, nullable=True))
    op.add_column("interviews", sa.Column("last_heartbeat", sa.DateTime, nullable=True))


def downgrade() -> None:
    """Remove session persistence columns."""
    with op.batch_alter_table("interviews") as batch_op:
        batch_op.drop_column("last_heartbeat")
        batch_op.drop_column("active_state")
