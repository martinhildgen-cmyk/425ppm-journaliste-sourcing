"""Fix notes.body column — ensure it exists in production.

Revision ID: 005
Revises: 004
"""

from alembic import op
import sqlalchemy as sa


revision = "005_fix_notes_body"
down_revision = "004_fix_columns"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # Check if the 'body' column exists on the 'notes' table
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'notes' AND column_name = 'body'"
        )
    )
    if result.fetchone() is None:
        # Check if there's a 'content' or 'text' column instead
        result2 = conn.execute(
            sa.text("SELECT column_name FROM information_schema.columns WHERE table_name = 'notes'")
        )
        columns = [row[0] for row in result2.fetchall()]

        if "content" in columns:
            op.alter_column("notes", "content", new_column_name="body")
        elif "text" in columns:
            op.alter_column("notes", "text", new_column_name="body")
        else:
            # Column doesn't exist at all — add it
            op.add_column("notes", sa.Column("body", sa.Text(), nullable=False, server_default=""))


def downgrade():
    pass
