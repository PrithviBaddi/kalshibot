"""Stage 12: registration, login, Kalshi credential storage."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.db import create_user, get_user_by_email, get_user_by_id, save_user_kalshi_credentials
from app.feature_flags import user_auth_enabled
from app.jwt_tokens import create_access_token
from app.kalshi_runtime import invalidate_user_kalshi_cache
from app.passwords import hash_password, verify_password

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


def _public_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "email": row["email"],
        "plan": row.get("plan") or "free",
        "subscription_status": row.get("subscription_status") or "none",
    }


@router.get("/me")
async def me(request: Request) -> dict[str, Any]:
    _require_user_auth()
    uid = int(getattr(request.state, "user_id", 0))
    if uid <= 0:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user": _public_user(user)}


@router.put("/kalshi-credentials")
async def put_kalshi_credentials(request: Request, body: KalshiKeysRequest) -> dict[str, Any]:
    """Store encrypted Kalshi Trade API credentials for the current user."""
    _require_user_auth()
    uid = int(getattr(request.state, "user_id", 0))
    if uid <= 0:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    try:
        save_user_kalshi_credentials(
            user_id=uid,
            api_key_id=body.api_key_id,
            private_key_pem=body.private_key_pem,
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    invalidate_user_kalshi_cache(request.app.state, uid)
    return {"ok": True, "message": "Credentials saved. Kalshi API calls will use these keys."}
