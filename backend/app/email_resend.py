"""Optional transactional email via Resend (https://resend.com)."""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)


async def send_resend_html(*, to_email: str, subject: str, html: str) -> bool:
    key = os.getenv("RESEND_API_KEY", "").strip()
    from_addr = os.getenv("EMAIL_FROM", "").strip()
    if not key or not from_addr:
        logger.warning("RESEND_API_KEY or EMAIL_FROM not set; email not sent.")
        return False
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"from": from_addr, "to": [to_email], "subject": subject, "html": html},
        )
        if r.status_code >= 400:
            logger.error("Resend error %s: %s", r.status_code, r.text)
            return False
    return True
