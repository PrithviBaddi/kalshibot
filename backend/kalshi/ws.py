"""Kalshi WebSocket URL and handshake headers (see quick_start_websockets)."""

import os
import time
from urllib.parse import urlparse

from kalshi.signing import load_private_key_from_env, sign_pss_text

# Path used in WS handshake signature — not the full REST prefix.
WS_SIGNATURE_PATH = "/trade-api/ws/v2"


def rest_base_to_ws_url(rest_base: str) -> str:
    """Map REST base (e.g. https://api.elections.kalshi.com/trade-api/v2) to WS URL."""
    u = urlparse(rest_base.rstrip("/"))
    scheme = "wss" if u.scheme == "https" else "ws"
    return f"{scheme}://{u.netloc}{WS_SIGNATURE_PATH}"


def build_ws_connect_headers(api_key_id: str | None = None, private_key=None) -> dict:
    """Headers for `websockets.connect(..., additional_headers=...)`."""
    key_id = api_key_id or os.getenv("KALSHI_API_KEY_ID")
    if not key_id:
        raise ValueError("KALSHI_API_KEY_ID is required")
    pk = private_key or load_private_key_from_env()
    timestamp = str(int(time.time() * 1000))
    signature = sign_pss_text(pk, timestamp, "GET", WS_SIGNATURE_PATH)
    return {
        "KALSHI-ACCESS-KEY": key_id,
        "KALSHI-ACCESS-SIGNATURE": signature,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
    }
