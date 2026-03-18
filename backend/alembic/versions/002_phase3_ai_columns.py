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
    # Using IF NOT EXISTS pattern via raw SQL to be safe if columns already exist
    conn = op.get_bind()

    for col_name, col_type in [
        ("justification", "TEXT"),
        ("angle_suggere", "TEXT"),
        ("risk_details", "TEXT"),
    ]:
        conn.execute(
            sa.text(f"ALTER TABLE pitch_matches ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
        )


def downgrade() -> None:
    op.drop_column("pitch_matches", "risk_details")
    op.drop_column("pitch_matches", "angle_suggere")
    op.drop_column("pitch_matches", "justification")
