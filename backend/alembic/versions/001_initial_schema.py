"""Initial schema — all tables for Phase 0.

Revision ID: 001_initial
Revises: None
Create Date: 2026-03-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        "users",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # Journalists
    op.create_table(
        "journalists",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column("first_name", sa.String(255)),
        sa.Column("last_name", sa.String(255)),
        sa.Column("job_title", sa.String(500)),
        sa.Column("email", sa.String(255)),
        sa.Column("email_status", sa.String(50), server_default="manquant"),
        sa.Column("linkedin_url", sa.String(500), unique=True),
        sa.Column("twitter_url", sa.String(500)),
        sa.Column("bluesky_url", sa.String(500)),
        sa.Column("city", sa.String(255)),
        sa.Column("country", sa.String(255)),
        sa.Column("media_name", sa.String(500)),
        sa.Column("media_type", sa.String(100)),
        sa.Column("media_scope", sa.String(100)),
        sa.Column("ai_summary", sa.Text()),
        sa.Column("ai_tonality", sa.String(100)),
        sa.Column("ai_preferred_formats", ARRAY(sa.Text())),
        sa.Column("ai_avoid_topics", sa.Text()),
        sa.Column("sector_macro", sa.String(100)),
        sa.Column("tags_micro", ARRAY(sa.Text())),
        sa.Column("ai_last_analyzed_at", sa.DateTime(timezone=True)),
        sa.Column("ai_prompt_version", sa.String(20)),
        sa.Column("job_title_previous", sa.String(500)),
        sa.Column("media_name_previous", sa.String(500)),
        sa.Column("job_last_updated_at", sa.DateTime(timezone=True)),
        sa.Column("job_last_checked_at", sa.DateTime(timezone=True)),
        sa.Column("movement_alert", sa.Boolean(), server_default=sa.text("FALSE")),
        sa.Column("is_watched", sa.Boolean(), server_default=sa.text("FALSE")),
        sa.Column("source", sa.String(100)),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # Contents
    op.create_table(
        "contents",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column(
            "journalist_id",
            UUID(as_uuid=True),
            sa.ForeignKey("journalists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content_type", sa.String(50)),
        sa.Column("title", sa.String(1000)),
        sa.Column("url", sa.String(2000), unique=True),
        sa.Column("body_text", sa.Text()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # Clients
    op.create_table(
        "clients",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("sector", sa.String(255)),
        sa.Column("description", sa.Text()),
        sa.Column("keywords", sa.JSON()),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # Campaigns
    op.create_table(
        "campaigns",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE")),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # Lists
    op.create_table(
        "lists",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column(
            "campaign_id", UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE")
        ),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # List ↔ Journalists (N:N)
    op.create_table(
        "list_journalists",
        sa.Column(
            "list_id",
            UUID(as_uuid=True),
            sa.ForeignKey("lists.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "journalist_id",
            UUID(as_uuid=True),
            sa.ForeignKey("journalists.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("added_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
    )

    # Notes
    op.create_table(
        "notes",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column(
            "journalist_id", UUID(as_uuid=True), sa.ForeignKey("journalists.id", ondelete="CASCADE")
        ),
        sa.Column("author_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # Pitch matches
    op.create_table(
        "pitch_matches",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column(
            "journalist_id", UUID(as_uuid=True), sa.ForeignKey("journalists.id", ondelete="CASCADE")
        ),
        sa.Column("pitch_subject", sa.Text(), nullable=False),
        sa.Column("score_match", sa.Integer()),
        sa.Column("verdict", sa.String(20)),
        sa.Column("pitch_advice", sa.Text()),
        sa.Column("bad_buzz_risk", sa.Boolean(), server_default=sa.text("FALSE")),
        sa.Column("is_draft", sa.Boolean(), server_default=sa.text("FALSE")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.CheckConstraint("score_match BETWEEN 0 AND 100", name="ck_pitch_score_range"),
    )

    # Prompt versions
    op.create_table(
        "prompt_versions",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column("prompt_name", sa.String(100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("user_prompt_template", sa.Text(), nullable=False),
        sa.Column("llm_provider", sa.String(50)),
        sa.Column("llm_model", sa.String(100)),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("FALSE")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("prompt_name", "version", name="uq_prompt_name_version"),
    )

    # Audit log
    op.create_table(
        "audit_log",
        sa.Column(
            "id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True
        ),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100)),
        sa.Column("entity_id", UUID(as_uuid=True)),
        sa.Column("details", JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # Indexes
    op.create_index("idx_journalists_email", "journalists", ["email"])
    op.create_index("idx_journalists_linkedin", "journalists", ["linkedin_url"])
    op.create_index("idx_journalists_name", "journalists", ["last_name", "first_name"])
    op.create_index("idx_journalists_media", "journalists", ["media_name", "media_type"])
    op.create_index("idx_journalists_sector", "journalists", ["sector_macro"])
    op.create_index("idx_journalists_tags", "journalists", ["tags_micro"], postgresql_using="gin")
    op.create_index(
        "idx_journalists_watched",
        "journalists",
        ["is_watched"],
        postgresql_where=sa.text("is_watched = true"),
    )
    op.create_index("idx_contents_journalist", "contents", ["journalist_id", "published_at"])
    op.create_index("idx_contents_url", "contents", ["url"])
    op.create_index("idx_audit_log_entity", "audit_log", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("prompt_versions")
    op.drop_table("pitch_matches")
    op.drop_table("notes")
    op.drop_table("list_journalists")
    op.drop_table("lists")
    op.drop_table("campaigns")
    op.drop_table("clients")
    op.drop_table("contents")
    op.drop_table("journalists")
    op.drop_table("users")
