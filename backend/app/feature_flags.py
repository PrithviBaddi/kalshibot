"""Runtime feature flags (environment)."""

from __future__ import annotations

import os


def user_auth_enabled() -> bool:
    return os.getenv("KALSHIBOT_USER_AUTH", "").strip().lower() in ("1", "true", "yes")


def jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "").strip()


def require_jwt_for_user_routes() -> bool:
    return user_auth_enabled() and bool(jwt_secret())
