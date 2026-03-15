import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PitchMatch(Base):
    __tablename__ = "pitch_matches"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    journalist_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("journalists.id"), nullable=False
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False
    )
    score: Mapped[float | None] = mapped_column(Float)
    rationale: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), server_default="suggested")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    journalist = relationship("Journalist", backref="pitch_matches", lazy="selectin")
    campaign = relationship("Campaign", backref="pitch_matches", lazy="selectin")
