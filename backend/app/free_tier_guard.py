"""Block Free-tier JWT users from Pro-only HTTP API routes (multi-tenant mode)."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.api_auth import get_api_token
from app.db import get_user_by_id
from app.feature_flags import user_auth_enabled
from app.plan_access import is_pro_subscriber


def _pro_only_api_path(path: str) -> bool:
    prefixes = (
        "/api/v1/series",
        "/api/v1/markets",
        "/api/v1/analysis",
        "/api/v1/scanner",
        "/api/v1/strategy",
        "/api/v1/risk",
        "/api/v1/orders",
        "/api/v1/paper",
        "/api/v1/dashboard",
        "/api/v1/jobs",
        "/api/v1/rules",
    )
    for p in prefixes:
        if path == p or path.startswith(p + "/"):
            return True
    return False


def _always_allow_api_path(path: str, method: str) -> bool:
    if path == "/api/v1/status":
        return True
    if path.startswith("/api/v1/auth"):
        return True
    if path.startswith("/api/v1/billing"):
        return True
    if path.startswith("/api/v1/daily-picks"):
        return True
    # Free /daily UI fetches one live quote for today's selected ticker.
    if method == "GET" and path.startswith("/api/v1/markets/"):
        tail = path.removeprefix("/api/v1/markets/")
        if tail and "/" not in tail:
            return True
    return False


class FreeTierApiGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        if not user_auth_enabled():
            return await call_next(request)
        path = request.url.path
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        auth = request.headers.get("authorization") or ""
        bearer = auth[7:].strip() if auth.startswith("Bearer ") else ""
        api_tok = get_api_token()
        if api_tok and bearer == api_tok:
            return await call_next(request)

        if _always_allow_api_path(path, request.method):
            return await call_next(request)
        if not _pro_only_api_path(path):
            return await call_next(request)

        uid = int(getattr(request.state, "user_id", 0))
        user = get_user_by_id(uid) if uid > 0 else None
        if user and is_pro_subscriber(user):
            return await call_next(request)

        return JSONResponse(
            status_code=403,
            content={
                "detail": (
                    "Free accounts only include the shared daily pick. "
                    "Subscribe to Pro for the full trading app, Kalshi connection, and automation."
                )
            },
        )
