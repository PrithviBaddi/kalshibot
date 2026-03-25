"""FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request

from kalshi.client import KalshiClient


def get_kalshi(request: Request) -> KalshiClient:
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
