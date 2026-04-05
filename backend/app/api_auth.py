"""
API authentication: optional shared secret (legacy) + Stage 12 JWT users.

WebSockets cannot send Authorization; use: ws://host/api/v1/ws/ticker?token=<same value>
"""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.feature_flags import jwt_secret, require_jwt_for_user_routes, user_auth_enabled
from app.jwt_tokens import decode_access_token
from app.request_context import reset_effective_user_id, set_effective_user_id


def get_api_token() -> str:
    return os.getenv("KALSHIBOT_API_TOKEN", "").strip()


def is_auth_enabled() -> bool:
    return bool(get_api_token())


def _exempt_path(path: str, method: str) -> bool:
    if method == "OPTIONS":
        return True
    if path == "/health":
        return True
    if path == "/api/v1/status":
        return True
    if path in ("/openapi.json", "/redoc"):
        return True
    if path == "/docs" or path.startswith("/docs/"):
        return True
    if path in ("/api/v1/auth/register", "/api/v1/auth/login"):
        return True
    if path == "/api/v1/billing/webhook":
        return True
    return False


def _needs_credential_gate(path: str, method: str) -> bool:
    if _exempt_path(path, method):
        return False
    if require_jwt_for_user_routes():
        return True
    if is_auth_enabled():
        return True
    return False


def _resolve_bearer_user_id(bearer: str) -> int | None:
    if not bearer:
        return None
    expected = get_api_token()
    if expected and bearer == expected:
        return 1
    if jwt_secret():
        payload = decode_access_token(bearer)
        if payload and payload.get("sub"):
            try:
                return int(payload["sub"])
            except (TypeError, ValueError):
                return None
    return None


class AuthContextMiddleware(BaseHTTPMiddleware):
    """Sets request context user_id (default 1) and enforces credentials when configured."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        if method == "OPTIONS":
            return await call_next(request)

        auth = request.headers.get("authorization") or ""
        bearer = auth[7:].strip() if auth.startswith("Bearer ") else ""

        resolved: int | None = None
        uid = 1
        if bearer:
            resolved = _resolve_bearer_user_id(bearer)
            if resolved is not None:
                uid = resolved

        if _needs_credential_gate(path, method) and resolved is None:
            return JSONResponse(
                status_code=401,
                content={
                    "detail": (
                        "Authentication required. Sign in (JWT) or send "
                        '"Authorization: Bearer <KALSHIBOT_API_TOKEN>" if your host uses a shared token.'
                    )
                },
            )

        token = set_effective_user_id(uid)
        try:
            request.state.user_id = uid
            return await call_next(request)
        finally:
            reset_effective_user_id(token)


def websocket_token_ok(websocket) -> bool:
    """WebSocket: query ?token= or Authorization header."""
    expected = get_api_token()
    secret = jwt_secret()
    q = (websocket.query_params.get("token") or "").strip()
    auth = (websocket.headers.get("authorization") or "").strip()
    bearer = auth[7:].strip() if auth.startswith("Bearer ") else ""

    if expected and (q == expected or auth == f"Bearer {expected}"):
        return True
    if secret and bearer:
        payload = decode_access_token(bearer)
        if payload and payload.get("sub"):
            return True
    if secret and q:
        payload = decode_access_token(q)
        if payload and payload.get("sub"):
            return True
    if not expected and not secret and not user_auth_enabled():
        return True
    return False
