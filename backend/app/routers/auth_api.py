"""Stage 12: registration, login, Kalshi credential storage."""

from __future__ import annotations

import hashlib
import logging
import secrets
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.db import (
    create_user,
    get_user_by_email,
    get_user_by_id,
    save_password_reset_token,
    save_user_kalshi_credentials,
    take_password_reset_user_id,
    update_user_password,
    user_has_kalshi_credentials,
)
from app.credentials_crypto import CredentialsEncryptionError
from app.plan_access import is_pro_subscriber
from kalshi.signing import load_private_key_from_pem_bytes, normalize_private_key_pem
from app.email_resend import send_resend_html
from app.feature_flags import user_auth_enabled
from app.jwt_tokens import create_access_token
from app.kalshi_runtime import invalidate_user_kalshi_cache
from app.passwords import hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str


class KalshiKeysRequest(BaseModel):
    api_key_id: str = Field(min_length=8, max_length=128)
    private_key_pem: str = Field(min_length=20, max_length=20000)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    password: str = Field(min_length=8, max_length=128)


def _require_user_auth() -> None:
    if not user_auth_enabled():
        raise HTTPException(
            status_code=503,
            detail="Multi-user auth is not enabled on this server (set KALSHIBOT_USER_AUTH=1).",
        )


@router.post("/register")
async def register(body: RegisterRequest) -> dict[str, Any]:
    _require_user_auth()
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    pw_hash = hash_password(body.password)
    uid = create_user(email=body.email, password_hash=pw_hash)
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=500, detail="User creation failed.")
    token = create_access_token(user_id=uid, email=user["email"])
    return {"access_token": token, "token_type": "bearer", "user": _public_user(user)}


@router.post("/login")
async def login(body: LoginRequest) -> dict[str, Any]:
    _require_user_auth()
    user = get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token(user_id=int(user["id"]), email=user["email"])
    return {"access_token": token, "token_type": "bearer", "user": _public_user(user)}


def _public_user(row: dict[str, Any], *, kalshi_configured: bool | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": int(row["id"]),
        "email": row["email"],
        "plan": row.get("plan") or "free",
        "subscription_status": row.get("subscription_status") or "none",
        "is_admin": bool(int(row.get("is_admin") or 0)),
        "is_pro": is_pro_subscriber(row),
    }
    if kalshi_configured is not None:
        out["kalshi_configured"] = kalshi_configured
    return out


@router.get("/me")
async def me(request: Request) -> dict[str, Any]:
    _require_user_auth()
    uid = int(getattr(request.state, "user_id", 0))
    if uid <= 0:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    kc = user_has_kalshi_credentials(uid)
    return {"user": _public_user(user, kalshi_configured=kc)}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest) -> dict[str, str]:
    """Always returns ok (no email enumeration). Sends reset link if RESEND is configured."""
    _require_user_auth()
    user = get_user_by_email(body.email)
    if user:
        raw = secrets.token_urlsafe(32)
        th = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        exp = int(time.time()) + 3600
        save_password_reset_token(user_id=int(user["id"]), token_hash=th, expires_at=exp)
        import os

        base = os.getenv("PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")
        link = f"{base}/reset-password?token={raw}"
        ok = await send_resend_html(
            to_email=user["email"],
            subject="Reset your KalshiBot password",
            html=(
                f"<p>Click to reset your password (expires in 1 hour):</p>"
                f'<p><a href="{link}">{link}</a></p>'
                f"<p>If you did not request this, ignore this email.</p>"
            ),
        )
        if not ok:
            logger.info("Password reset link (email not configured): %s", link)
    return {"ok": "true", "message": "If an account exists for that email, a reset link was sent."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest) -> dict[str, str]:
    _require_user_auth()
    th = hashlib.sha256(body.token.encode("utf-8")).hexdigest()
    uid = take_password_reset_user_id(token_hash=th)
    if uid is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")
    update_user_password(uid, password_hash=hash_password(body.password))
    return {"ok": "true", "message": "Password updated. You can sign in."}


@router.put("/kalshi-credentials")
async def put_kalshi_credentials(request: Request, body: KalshiKeysRequest) -> dict[str, Any]:
    """Store encrypted Kalshi Trade API credentials for the current user."""
    _require_user_auth()
    uid = int(getattr(request.state, "user_id", 0))
    if uid <= 0:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    user = get_user_by_id(uid)
    if not user or not is_pro_subscriber(user):
        raise HTTPException(
            status_code=403,
            detail="Connecting Kalshi API keys is a Pro feature. Upgrade to use the full trading app.",
        )
    pem_norm = normalize_private_key_pem(body.private_key_pem)
    try:
        load_private_key_from_pem_bytes(pem_norm.encode("utf-8"))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=(
                "Private key is not a valid RSA PEM. Paste the full key from Kalshi, including "
                "-----BEGIN ... ----- and -----END ... ----- lines, with normal line breaks (not a single "
                f"line of text). Underlying error: {e!s}"
            ),
        ) from e
    try:
        save_user_kalshi_credentials(
            user_id=uid,
            api_key_id=body.api_key_id,
            private_key_pem=body.private_key_pem,
        )
    except CredentialsEncryptionError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    invalidate_user_kalshi_cache(request.app.state, uid)
    return {"ok": True, "message": "Credentials saved. Kalshi API calls will use these keys."}
