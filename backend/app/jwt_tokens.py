"""JWT access tokens for Stage 12 user sessions."""

from __future__ import annotations

import os
import time
from typing import Any

import jwt
from jwt.exceptions import PyJWTError

from app.feature_flags import jwt_secret


def create_access_token(*, user_id: int, email: str, expires_seconds: int | None = None) -> str:
    secret = jwt_secret()
    if not secret:
        raise ValueError("JWT_SECRET is not set")
    ttl = expires_seconds or int(os.getenv("JWT_EXPIRES_SECONDS", "604800"))  # 7d default
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any] | None:
    secret = jwt_secret()
    if not secret:
        return None
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except PyJWTError:
        return None
