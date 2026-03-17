"""Add missing body column to notes table.

The notes table was likely created via Base.metadata.create_all before
migrations were introduced, and the body column was not included.

Revision ID: 005_fix_notes_body
Revises: 004_fix_columns
Create Date: 2026-03-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005_fix_notes_body"
down_revision: Union[str, None] = "004_fix_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE notes ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT ''"
    ))


def downgrade() -> None:
    pass
