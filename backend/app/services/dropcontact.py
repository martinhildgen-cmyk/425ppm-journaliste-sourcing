"""
Dropcontact API — email enrichment service.

Usage:
    from app.services.dropcontact import DropcontactService
    service = DropcontactService(api_key)
    result = await service.enrich(first_name="Marie", last_name="Dupont", company="Le Monde")
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.dropcontact.com"
POLL_INTERVAL_S = 5
POLL_TIMEOUT_S = 60


@dataclass
class DropcontactResult:
    email: str | None
    email_status: str | None
    linkedin_url: str | None
    phone: str | None
    first_name: str | None = None
    last_name: str | None = None
    company: str | None = None
    job_title: str | None = None


class DropcontactService:
    """Async wrapper around the Dropcontact batch enrichment API."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.DROPCONTACT_API_KEY

    async def enrich(
        self,
        first_name: str = "",
        last_name: str = "",
        company: str = "",
        linkedin_url: str | None = None,
    ) -> DropcontactResult:
        """Enrich a contact and return available data.

        Submits a batch request, then polls until the result is ready
        (every 5 s, up to 60 s max).  Returns a result with ``None``
        fields for anything not found.

        The Dropcontact API accepts a ``linkedin`` field to resolve
        contacts from their LinkedIn profile URL.
        """
        headers = {
            "X-Access-Token": self.api_key,
            "Content-Type": "application/json",
        }
        contact_data: dict = {}
        if first_name:
            contact_data["first_name"] = first_name
        if last_name:
            contact_data["last_name"] = last_name
        if company:
            contact_data["company"] = company
        if linkedin_url:
            contact_data["linkedin"] = linkedin_url

        if not contact_data:
            return self._empty_result()

        payload = {
            "data": [contact_data],
            "siren": False,
            "language": "fr",
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # --- submit batch ---
                resp = await client.post(
                    f"{BASE_URL}/batch",
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                body = resp.json()
                request_id = body.get("request_id")
                if not request_id:
                    logger.error("Dropcontact: no request_id in response: %s", body)
                    return self._empty_result()

                # --- poll for completion ---
                elapsed = 0.0
                while elapsed < POLL_TIMEOUT_S:
                    await asyncio.sleep(POLL_INTERVAL_S)
                    elapsed += POLL_INTERVAL_S

                    poll_resp = await client.get(
                        f"{BASE_URL}/batch/{request_id}",
                        headers=headers,
                    )
                    poll_resp.raise_for_status()
                    poll_body = poll_resp.json()

                    if poll_body.get("success"):
                        return self._parse_result(poll_body)

                logger.warning(
                    "Dropcontact: polling timed out after %ss for request %s",
                    POLL_TIMEOUT_S,
                    request_id,
                )
                return self._empty_result()

        except httpx.HTTPStatusError as exc:
            logger.error(
                "Dropcontact HTTP error %s: %s",
                exc.response.status_code,
                exc.response.text,
            )
            return self._empty_result()
        except Exception:
            logger.exception("Dropcontact: unexpected error during enrichment")
            return self._empty_result()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_result(body: dict) -> DropcontactResult:
        data = body.get("data", [])
        if not data:
            return DropcontactResult(email=None, email_status=None, linkedin_url=None, phone=None)

        contact = data[0]
        email_list = contact.get("email")
        email = email_list[0].get("email") if isinstance(email_list, list) and email_list else None

        return DropcontactResult(
            email=email,
            email_status=contact.get("qualification"),
            linkedin_url=contact.get("linkedin"),
            phone=contact.get("phone"),
            first_name=contact.get("first_name"),
            last_name=contact.get("last_name"),
            company=contact.get("company"),
            job_title=contact.get("job"),
        )

    @staticmethod
    def _empty_result() -> DropcontactResult:
        return DropcontactResult(email=None, email_status=None, linkedin_url=None, phone=None)
