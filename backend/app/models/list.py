import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class List(Base):
    __tablename__ = "lists"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("campaigns.id")
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    campaign = relationship("Campaign", backref="lists", lazy="selectin")
    owner = relationship("User", backref="lists", lazy="selectin")
    journalists = relationship(
        "Journalist", secondary="list_journalists", backref="lists", lazy="selectin"
    )


class ListJournalist(Base):
    __tablename__ = "list_journalists"

    list_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("lists.id"), primary_key=True
    )
    journalist_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("journalists.id"), primary_key=True
    )
    added_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
