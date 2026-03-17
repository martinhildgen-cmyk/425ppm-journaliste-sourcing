"""Fix missing columns and type mismatches in production DB.

The initial migration (001) was marked as applied but some tables were
created with an incomplete schema (likely via Base.metadata.create_all
before migrations were introduced). This migration adds the missing
columns and fixes type mismatches.

Revision ID: 004_fix_columns
Revises: 003_addendum_v1
Create Date: 2026-03-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004_fix_columns"
down_revision: Union[str, None] = "003_addendum_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── clients table: add missing columns ──
    conn.execute(sa.text(
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS sector VARCHAR(255)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS description TEXT"
    ))
    conn.execute(sa.text(
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS keywords JSON"
    ))
    conn.execute(sa.text(
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"
    ))
    conn.execute(sa.text(
        "ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()"
    ))

    # ── lists table: add missing columns ──
    conn.execute(sa.text(
        "ALTER TABLE lists ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE lists ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE"
    ))
    conn.execute(sa.text(
        "ALTER TABLE lists ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"
    ))
    conn.execute(sa.text(
        "ALTER TABLE lists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()"
    ))

    # ── campaigns table: add missing columns ──
    conn.execute(sa.text(
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description TEXT"
    ))
    conn.execute(sa.text(
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft'"
    ))
    conn.execute(sa.text(
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"
    ))
    conn.execute(sa.text(
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()"
    ))

    # ── audit_log table: fix id type if it's BIGINT instead of UUID ──
    # Check current type and fix if needed
    result = conn.execute(sa.text("""
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'audit_log' AND column_name = 'id'
    """))
    row = result.fetchone()
    if row and row[0] != 'uuid':
        # Drop and recreate the id column as UUID
        # First drop any existing primary key constraint
        conn.execute(sa.text("""
            DO $$
            BEGIN
                -- Drop all rows since we're changing the PK type
                DELETE FROM audit_log;
                -- Drop PK if exists
                ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;
                -- Drop old column
                ALTER TABLE audit_log DROP COLUMN id;
                -- Add new UUID column
                ALTER TABLE audit_log ADD COLUMN id UUID DEFAULT gen_random_uuid() PRIMARY KEY;
            END $$;
        """))

    # Ensure entity_id is UUID (might be VARCHAR or missing)
    result = conn.execute(sa.text("""
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'audit_log' AND column_name = 'entity_id'
    """))
    row = result.fetchone()
    if row and row[0] != 'uuid':
        conn.execute(sa.text("""
            ALTER TABLE audit_log
            ALTER COLUMN entity_id TYPE UUID USING entity_id::UUID
        """))
    elif not row:
        conn.execute(sa.text(
            "ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id UUID"
        ))

    # Ensure details column is JSONB
    conn.execute(sa.text(
        "ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details JSONB"
    ))

    # ── contents table: ensure url is TEXT (might be VARCHAR) ──
    conn.execute(sa.text("""
        ALTER TABLE contents ALTER COLUMN url TYPE TEXT
    """))


def downgrade() -> None:
    # This is a corrective migration - downgrade is not meaningful
    pass
