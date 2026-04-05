"""FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.feature_flags import user_auth_enabled
from app.kalshi_runtime import get_kalshi_for_user
from kalshi.client import KalshiClient


async def get_kalshi(request: Request) -> KalshiClient:
    uid = getattr(request.state, "user_id", 1)
    if user_auth_enabled():
        k = await get_kalshi_for_user(request.app.state, uid)
        if k is None:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Kalshi is not configured for this account. "
                    "Add your Kalshi API Key ID and private key (PEM) in Settings."
                ),
            )
        return k
    client = getattr(request.app.state, "kalshi", None)
    if client is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Kalshi is not configured. Set KALSHI_API_KEY_ID and "
                "KALSHI_PRIVATE_KEY_PATH (or KALSHI_PRIVATE_KEY)."
            ),
        )
    return client


Kalshi = Annotated[KalshiClient, Depends(get_kalshi)]
