import uuid
from datetime import datetime, timezone

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, JSON, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Use ARRAY(Text) for PostgreSQL, fallback to JSON for SQLite (tests)
import os
if os.environ.get("TESTING") == "1":
    ArrayOfText = JSON
else:
    ArrayOfText = ARRAY(Text)


class Journalist(Base):
    __tablename__ = "journalists"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    job_title: Mapped[str | None] = mapped_column(String(500))
    email: Mapped[str | None] = mapped_column(String(255))
    email_status: Mapped[str] = mapped_column(String(50), server_default="manquant")
    linkedin_url: Mapped[str | None] = mapped_column(String(500), unique=True)
    twitter_url: Mapped[str | None] = mapped_column(String(500))
    bluesky_url: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(255))
    media_name: Mapped[str | None] = mapped_column(String(500))
    media_type: Mapped[str | None] = mapped_column(String(100))
    media_scope: Mapped[str | None] = mapped_column(String(100))
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_tonality: Mapped[str | None] = mapped_column(String(100))
    ai_preferred_formats: Mapped[list[str] | None] = mapped_column(ArrayOfText)
    ai_avoid_topics: Mapped[str | None] = mapped_column(Text)
    sector_macro: Mapped[str | None] = mapped_column(String(100))
    tags_micro: Mapped[list[str] | None] = mapped_column(ArrayOfText)
    ai_last_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ai_prompt_version: Mapped[str | None] = mapped_column(String(20))
    job_title_previous: Mapped[str | None] = mapped_column(String(500))
    media_name_previous: Mapped[str | None] = mapped_column(String(500))
    job_last_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    job_last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    movement_alert: Mapped[bool] = mapped_column(Boolean, server_default=text("FALSE"))
    is_watched: Mapped[bool] = mapped_column(Boolean, server_default=text("FALSE"))
    source: Mapped[str | None] = mapped_column(String(100))
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", backref="journalists", lazy="selectin")
