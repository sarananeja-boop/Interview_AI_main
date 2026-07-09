"""Initial schema — baseline migration.

This migration represents the existing database schema.
It was created manually to baseline an existing database.

Revision ID: 001_initial
Revises: None
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all initial tables (if they don't exist)."""
    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime),
        if_not_exists=True,
    )

    # Profiles table
    op.create_table(
        "profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("resume_filename", sa.String(255)),
        sa.Column("raw_text", sa.Text),
        sa.Column("parsed_profile", sa.JSON),
        sa.Column("strengths", sa.JSON),
        sa.Column("weaknesses", sa.JSON),
        sa.Column("pressure_points", sa.JSON),
        sa.Column("likely_questions", sa.JSON),
        sa.Column("created_at", sa.DateTime),
        if_not_exists=True,
    )

    # Interviews table
    op.create_table(
        "interviews",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", sa.String(36), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), default="setup"),
        sa.Column("interview_type", sa.String(50), default="iim_general"),
        sa.Column("target_iim", sa.String(50)),
        sa.Column("panel_config", sa.JSON),
        sa.Column("conversation_log", sa.JSON),
        sa.Column("contradiction_tracker", sa.JSON),
        sa.Column("behavioral_metrics", sa.JSON),
        sa.Column("started_at", sa.DateTime),
        sa.Column("ended_at", sa.DateTime),
        if_not_exists=True,
    )

    # Evaluations table
    op.create_table(
        "evaluations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("interview_id", sa.String(36), sa.ForeignKey("interviews.id"), unique=True, nullable=False),
        sa.Column("dimension_scores", sa.JSON),
        sa.Column("overall_score", sa.Float),
        sa.Column("weak_answers", sa.JSON),
        sa.Column("improvement_plan", sa.JSON),
        sa.Column("panel_perception", sa.Text),
        sa.Column("created_at", sa.DateTime),
        if_not_exists=True,
    )


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table("evaluations")
    op.drop_table("interviews")
    op.drop_table("profiles")
    op.drop_table("users")
