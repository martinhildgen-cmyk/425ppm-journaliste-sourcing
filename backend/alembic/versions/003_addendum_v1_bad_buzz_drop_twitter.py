"""Addendum V1 — add bad_buzz_risk to journalists, drop twitter/bluesky columns.

Revision ID: 003_addendum_v1
Revises: 002_phase3_ai
Create Date: 2026-03-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003_addendum_v1"
down_revision: Union[str, None] = "002_phase3_ai"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add bad_buzz_risk boolean on journalists table (was only on pitch_matches)
    conn.execute(
        sa.text(
            "ALTER TABLE journalists ADD COLUMN IF NOT EXISTS bad_buzz_risk BOOLEAN DEFAULT FALSE"
        )
    )

    # Drop twitter_url and bluesky_url columns — Twitter removed from MVP
    conn.execute(
        sa.text("ALTER TABLE journalists DROP COLUMN IF EXISTS twitter_url")
    )
    conn.execute(
        sa.text("ALTER TABLE journalists DROP COLUMN IF EXISTS bluesky_url")
    )


def downgrade() -> None:
    op.add_column("journalists", sa.Column("bluesky_url", sa.String(500)))
    op.add_column("journalists", sa.Column("twitter_url", sa.String(500)))
    op.drop_column("journalists", "bad_buzz_risk")
