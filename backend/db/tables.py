"""
SQLAlchemy ORM table definitions.
Maps directly to the database schema in the implementation plan.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base
from core.security import EncryptedText, EncryptedJSON


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    profiles: Mapped[list["Profile"]] = relationship(back_populates="user")
    interviews: Mapped[list["Interview"]] = relationship(back_populates="user")


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    resume_filename: Mapped[str] = mapped_column(String(255), nullable=True)
    raw_text: Mapped[str] = mapped_column(EncryptedText, nullable=True)
    parsed_profile: Mapped[dict] = mapped_column(EncryptedJSON, nullable=True)
    strengths: Mapped[list] = mapped_column(JSON, nullable=True)
    weaknesses: Mapped[list] = mapped_column(JSON, nullable=True)
    pressure_points: Mapped[list] = mapped_column(JSON, nullable=True)
    likely_questions: Mapped[list] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="profiles")
    interviews: Mapped[list["Interview"]] = relationship(back_populates="profile")


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="setup")  # setup|active|completed
    interview_type: Mapped[str] = mapped_column(String(50), default="iim_general")
    target_iim: Mapped[str] = mapped_column(String(50), nullable=True)
    panel_config: Mapped[dict] = mapped_column(JSON, nullable=True)
    conversation_log: Mapped[list] = mapped_column(EncryptedJSON, default=list)
    contradiction_tracker: Mapped[dict] = mapped_column(JSON, default=dict)
    behavioral_metrics: Mapped[dict] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    # Session persistence — allows recovery after server restart
    active_state: Mapped[dict | None] = mapped_column(EncryptedJSON, nullable=True)
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="interviews")
    profile: Mapped["Profile"] = relationship(back_populates="interviews")
    evaluation: Mapped["Evaluation"] = relationship(back_populates="interview", uselist=False)


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    interview_id: Mapped[str] = mapped_column(ForeignKey("interviews.id"), unique=True, nullable=False)
    dimension_scores: Mapped[dict] = mapped_column(JSON, nullable=True)
    overall_score: Mapped[float] = mapped_column(nullable=True)
    overall_assessment: Mapped[str] = mapped_column(Text, nullable=True)
    weak_answers: Mapped[list] = mapped_column(JSON, nullable=True)
    strengths: Mapped[list] = mapped_column(JSON, nullable=True)
    improvement_plan: Mapped[list] = mapped_column(JSON, nullable=True)
    panel_perception: Mapped[str] = mapped_column(Text, nullable=True)
    candidate_potential: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    interview: Mapped["Interview"] = relationship(back_populates="evaluation")
