"""Global daily pick — Free tier; generation protected by KALSHIBOT_API_TOKEN."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from app.api_auth import get_api_token
from app.daily_pick_job import run_daily_pick_generation
from app.db import (
    _utc_day_string,
    delete_global_daily_pick,
    get_daily_pick_accuracy_stats,
    get_global_daily_pick,
    list_global_daily_pick_history,
    resolve_global_daily_pick,
)
from app.feature_flags import jwt_secret, user_auth_enabled
from app.jwt_tokens import decode_access_token

router = APIRouter(prefix="/api/v1/daily-picks", tags=["daily-picks"])


class ResolveDailyPickBody(BaseModel):
    date: str = Field(..., min_length=10, max_length=10, description='UTC calendar day "YYYY-MM-DD"')
    resolved: bool
    resolution_correct: bool | None = None

    @model_validator(mode="after")
    def _validate_resolution(self):
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", self.date.strip()):
            raise ValueError('date must be a UTC date string like "2026-04-18"')
        if self.resolved:
            if self.resolution_correct is None:
                raise ValueError("resolution_correct is required when resolved is true")
        elif self.resolution_correct is not None:
            raise ValueError("resolution_correct must be omitted when resolved is false")
        return self


def _require_admin_bearer(request: Request) -> None:
    expected = get_api_token()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Set KALSHIBOT_API_TOKEN in the server environment, then call with Authorization: Bearer <same value>.",
        )
    auth = request.headers.get("authorization") or ""
    bearer = auth[7:].strip() if auth.startswith("Bearer ") else ""
    if bearer != expected:
        raise HTTPException(
            status_code=403,
            detail=(
                "Invalid admin token for daily pick generation. "
                "Send the same value as backend KALSHIBOT_API_TOKEN (not your user login JWT)."
            ),
        )


def _require_user_jwt_not_api_token(request: Request) -> None:
    """Pick history is for signed-in accounts (Free or Pro), not the shared admin API token."""
    if not user_auth_enabled():
        raise HTTPException(
            status_code=503,
            detail="Pick history is available in multi-user mode (KALSHIBOT_USER_AUTH=1).",
        )
    secret = jwt_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="JWT_SECRET is not set on the server.")
    auth = request.headers.get("authorization") or ""
    bearer = auth[7:].strip() if auth.startswith("Bearer ") else ""
    if not bearer:
        raise HTTPException(status_code=401, detail="Sign in to view pick history.")
    expected = get_api_token()
    if expected and bearer == expected:
        raise HTTPException(
            status_code=401,
            detail="Use your user session (login JWT) for pick history, not the admin API token.",
        )
    payload = decode_access_token(bearer)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired session. Sign in again.")


@router.get("/today")
async def get_today_pick() -> dict[str, Any]:
    """Any logged-in user (Free or Pro). No Kalshi credentials required."""
    if not user_auth_enabled():
        raise HTTPException(status_code=503, detail="Daily picks are defined for multi-user mode (KALSHIBOT_USER_AUTH=1).")
    day = _utc_day_string()
    row = get_global_daily_pick(day)
    if not row:
        return {
            "ok": False,
            "day": day,
            "message": "No pick has been generated for today yet. Ask the operator to run POST /api/v1/daily-picks/generate.",
            "ticker": None,
            "title": None,
            "summary": None,
            "confidence": None,
            "market_implied_yes": None,
            "model_yes_probability": None,
            "confidence_score": None,
            "edge": None,
            "recommended_action": None,
            "reasoning": None,
            "pick": None,
            "created_at": None,
            "resolved": None,
            "resolution_correct": None,
            "resolved_at": None,
            "context_sources_used": None,
            "resolution_result": None,
        }
    return {
        "ok": True,
        "day": row["day"],
        "ticker": row["ticker"],
        "title": row["title"],
        "summary": row["summary"],
        "confidence": row["confidence"],
        "market_implied_yes": row["market_implied_yes"],
        "model_yes_probability": row["model_yes_probability"],
        "confidence_score": row["confidence_score"],
        "edge": row["edge"],
        "recommended_action": row["recommended_action"],
        "reasoning": row["reasoning"],
        "pick": row["pick"],
        "created_at": row["created_at"],
        "resolved": row.get("resolved"),
        "resolution_correct": row.get("resolution_correct"),
        "resolved_at": row.get("resolved_at"),
        "context_sources_used": row.get("context_sources_used"),
        "resolution_result": row.get("resolution_result"),
    }


@router.post("/generate")
async def generate_daily_pick(request: Request) -> dict[str, Any]:
    """Cron or manual: requires shared API token (not a user JWT)."""
    _require_admin_bearer(request)
    try:
        out = await run_daily_pick_generation()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {"ok": True, **out}


@router.delete("/today")
async def delete_today_pick(request: Request) -> dict[str, Any]:
    """Operator/admin: delete today's stored pick so generation can be rerun."""
    _require_admin_bearer(request)
    day = _utc_day_string()
    deleted = delete_global_daily_pick(day)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No daily pick stored for UTC day {day}.")
    return {"ok": True, "deleted": True, "day": day}


@router.post("/resolve")
async def resolve_daily_pick(request: Request, body: ResolveDailyPickBody) -> dict[str, Any]:
    """Operator: mark whether the recommendation for a past UTC day was correct."""
    _require_admin_bearer(request)
    day = body.date.strip()
    try:
        updated = resolve_global_daily_pick(
            day=day,
            resolved=body.resolved,
            resolution_correct=body.resolution_correct,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not updated:
        raise HTTPException(status_code=404, detail=f"No daily pick stored for day {day}.")
    return {"ok": True, "day": day, "resolved": body.resolved, "resolution_correct": body.resolution_correct}


@router.get("/accuracy")
async def daily_pick_accuracy(request: Request) -> dict[str, Any]:
    """
    Aggregate calibration stats (JWT users). PASS picks count as resolved but are excluded from accuracy %.
    """
    _require_user_jwt_not_api_token(request)
    stats = get_daily_pick_accuracy_stats()
    return {"ok": True, **stats}


@router.get("/history")
async def daily_pick_history(request: Request) -> dict[str, Any]:
    """Last 30 UTC days of picks including resolution fields (JWT users only)."""
    _require_user_jwt_not_api_token(request)
    picks = list_global_daily_pick_history(limit=30)
    resolved_n = sum(1 for p in picks if p.get("resolved") is True)
    correct_n = sum(1 for p in picks if p.get("resolved") is True and p.get("resolution_correct") is True)
    return {
        "ok": True,
        "picks": picks,
        "stats": {
            "resolved_in_window": resolved_n,
            "correct_in_window": correct_n,
        },
    }
