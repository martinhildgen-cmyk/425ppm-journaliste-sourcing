"""Audit logging service — records user actions for traceability."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


async def log_action(
    session: AsyncSession,
    *,
    user_id: str | None,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Record an action in the audit log."""
    try:
        entry = AuditLog(
            user_id=UUID(user_id) if user_id else None,
            action=action,
            entity_type=entity_type,
            entity_id=UUID(entity_id) if entity_id else None,
            details=details,
        )
        session.add(entry)
        # Don't commit — let the caller's transaction handle it
    except Exception as e:
        logger.warning("Failed to write audit log: %s", e)
