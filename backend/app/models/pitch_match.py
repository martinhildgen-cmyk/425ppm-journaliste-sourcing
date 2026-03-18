import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PitchMatch(Base):
    __tablename__ = "pitch_matches"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    journalist_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("journalists.id", ondelete="CASCADE"), nullable=False
    )
    pitch_subject: Mapped[str] = mapped_column(Text, nullable=False)
    score_match: Mapped[int | None] = mapped_column(Integer)
    verdict: Mapped[str | None] = mapped_column(String(20))  # GO | NO GO | À RISQUE
    justification: Mapped[str | None] = mapped_column(Text)
    angle_suggere: Mapped[str | None] = mapped_column(Text)
    pitch_advice: Mapped[str | None] = mapped_column(Text)
    bad_buzz_risk: Mapped[bool] = mapped_column(Boolean, server_default="false")
    risk_details: Mapped[str | None] = mapped_column(Text)
    is_draft: Mapped[bool] = mapped_column(Boolean, server_default="false")  # sandbox mode
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        server_default="now()",
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    journalist = relationship("Journalist", backref="pitch_matches", lazy="selectin")
