"""Phase 3 — add AI-related columns to pitch_matches.

Revision ID: 002_phase3_ai
Revises: 001_initial
Create Date: 2026-03-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_phase3_ai"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add justification, angle_suggere, risk_details to pitch_matches
    op.add_column("pitch_matches", sa.Column("justification", sa.Text(), nullable=True))
    op.add_column("pitch_matches", sa.Column("angle_suggere", sa.Text(), nullable=True))
    op.add_column("pitch_matches", sa.Column("risk_details", sa.Text(), nullable=True))

    # Drop old columns from pitch_matches if they exist (campaign_id, score, rationale, status)
    # These were from a previous iteration that didn't match the PRD
    try:
        op.drop_constraint("pitch_matches_campaign_id_fkey", "pitch_matches", type_="foreignkey")
        op.drop_column("pitch_matches", "campaign_id")
    except Exception:
        pass
    try:
        op.drop_column("pitch_matches", "score")
    except Exception:
        pass
    try:
        op.drop_column("pitch_matches", "rationale")
    except Exception:
        pass
    try:
        op.drop_column("pitch_matches", "status")
    except Exception:
        pass


def downgrade() -> None:
    op.drop_column("pitch_matches", "risk_details")
    op.drop_column("pitch_matches", "angle_suggere")
    op.drop_column("pitch_matches", "justification")
