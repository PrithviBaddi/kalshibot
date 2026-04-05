"""Resolve Kalshi HTTP client: env-based (legacy) or per-user encrypted credentials (Stage 12)."""

from __future__ import annotations

import os
from typing import Any

from kalshi.client import KalshiClient

from app.db import load_user_kalshi_credentials
from app.feature_flags import user_auth_enabled


def invalidate_user_kalshi_cache(app_state: Any, user_id: int) -> None:
    cache = getattr(app_state, "user_kalshi_clients", None)
    if isinstance(cache, dict):
        cache.pop(user_id, None)


async def get_kalshi_for_user(app_state: Any, user_id: int) -> KalshiClient | None:
    """
    Returns a Kalshi client for the user when Stage 12 credentials exist.
    Caches AsyncClient instances on app.state.user_kalshi_clients[user_id].
    """
    if not user_auth_enabled():
        return getattr(app_state, "kalshi", None)

    cache: dict[int, KalshiClient] = getattr(app_state, "user_kalshi_clients", None)
    if cache is None:
        cache = {}
        app_state.user_kalshi_clients = cache

    if user_id in cache:
        return cache[user_id]

    creds = load_user_kalshi_credentials(user_id)
    if not creds:
        return None
    api_key_id, pem = creds
    base = os.getenv("KALSHI_API_BASE")
    try:
        client = KalshiClient(base_url=base, api_key_id=api_key_id, private_key_pem=pem)
    except ValueError:
        return None
    cache[user_id] = client
    return client
