"""Free vs Pro tier helpers (Stage 12 SaaS)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from app.db import (
    assert_free_tier_analysis_allowed,
    assert_free_tier_job_run_allowed,
    assert_free_tier_scanner_allowed,
    get_user_by_id,
    record_job_run_request,
    record_scanner_request,
)
from app.feature_flags import user_auth_enabled


def is_pro_subscriber(user: dict[str, Any]) -> bool:
    plan = str(user.get("plan") or "free")
    st = str(user.get("subscription_status") or "none")
    return plan == "pro" and st in ("active", "trialing")


def _user_for_request(request: Request) -> dict[str, Any]:
    uid = int(getattr(request.state, "user_id", 0))
    if uid <= 0:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


def require_pro_subscriber(request: Request) -> None:
    """Live trading, disabling paper mode, and other premium actions (multi-tenant only)."""
    if not user_auth_enabled():
        return
    user = _user_for_request(request)
    if not is_pro_subscriber(user):
        raise HTTPException(
            status_code=402,
            detail="This action requires an active Pro subscription. Open Pricing to upgrade.",
        )


def analysis_enrichment_flags(request: Request) -> tuple[bool, bool]:
    """
    Returns (allow_claude, allow_news) for /api/v1/analysis/market.
    Legacy single-tenant: both True (subject to server keys).
    Multi-tenant: Pro gets full; Free gets no Claude, news optional via FREE_TIER_NEWS.
    """
    import os

    if not user_auth_enabled():
        return True, True
    user = _user_for_request(request)
    uid = int(user["id"])
    pro = is_pro_subscriber(user)
    assert_free_tier_analysis_allowed(user_id=uid, is_pro=pro)
    if pro:
        return True, True
    free_news = os.getenv("FREE_TIER_NEWS", "1").strip() == "1"
    return False, free_news


def enforce_scanner_quota(request: Request) -> None:
    if not user_auth_enabled():
        return
    user = _user_for_request(request)
    assert_free_tier_scanner_allowed(
        user_id=int(user["id"]),
        is_pro=is_pro_subscriber(user),
    )


def record_scanner_use(request: Request) -> None:
    if not user_auth_enabled():
        return
    uid = int(getattr(request.state, "user_id", 0))
    if uid > 0:
        record_scanner_request(uid)


def enforce_manual_job_run_quota(request: Request) -> None:
    if not user_auth_enabled():
        return
    user = _user_for_request(request)
    assert_free_tier_job_run_allowed(
        user_id=int(user["id"]),
        is_pro=is_pro_subscriber(user),
    )


def record_manual_job_run(request: Request) -> None:
    if not user_auth_enabled():
        return
    uid = int(getattr(request.state, "user_id", 0))
    if uid > 0:
        record_job_run_request(uid)
