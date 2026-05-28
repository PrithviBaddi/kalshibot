"""Pro / trial on-demand market analysis (full agentic pipeline)."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.daily_pick_job import evaluate_market_for_pick, evaluation_result_to_api_dict
from app.db import assert_on_demand_allowed, get_on_demand_usage_today, get_user_by_id, record_on_demand_use
from app.feature_flags import user_auth_enabled
from app.plan_access import is_pro_subscriber
from kalshi.client import KalshiClient

router = APIRouter(prefix="/api/v1/analysis", tags=["analysis"])


class OnDemandBody(BaseModel):
    ticker: str = Field(min_length=2, max_length=128)


_TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,127}$", re.IGNORECASE)


def _parse_ticker(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise HTTPException(status_code=400, detail="ticker is required.")
    if "kalshi.com" in s.lower():
        m = re.search(r"/markets/([A-Za-z0-9_-]+)", s, re.IGNORECASE)
        if m:
            s = m.group(1)
        else:
            m2 = re.search(r"([A-Z][A-Z0-9_-]{3,})", s.upper())
            if m2:
                s = m2.group(1)
    s = s.upper().strip()
    if not _TICKER_RE.match(s):
        raise HTTPException(status_code=400, detail="Invalid Kalshi ticker format.")
    return s


def _require_authenticated_user(request: Request) -> dict[str, Any]:
    if not user_auth_enabled():
        return {"id": 1, "plan": "pro", "subscription_status": "active", "is_admin": 0}
    uid = int(getattr(request.state, "user_id", 0))
    if uid <= 0:
        raise HTTPException(status_code=401, detail="Sign in to run on-demand analysis.")
    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


@router.post("/on-demand")
async def on_demand_analysis(request: Request, body: OnDemandBody) -> dict[str, Any]:
    user = _require_authenticated_user(request)
    pro = is_pro_subscriber(user)
    assert_on_demand_allowed(user_id=int(user["id"]), is_pro=pro)

    ticker = _parse_ticker(body.ticker)
    k: KalshiClient | None = None
    try:
        k = KalshiClient()
        result = await evaluate_market_for_pick(k, ticker)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    finally:
        if k is not None:
            await k.aclose()

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Market not found, closed, or failed validation for analysis.",
        )

    record_on_demand_use(int(user["id"]))
    payload = evaluation_result_to_api_dict(result)
    usage = get_on_demand_usage_today(int(user["id"]))
    market = result.get("market") or {}
    category = str(market.get("category") or "On-Demand")
    return {
        "ok": True,
        "analysis": {
            **payload,
            "category": category,
            "contract_reference": f"{payload['ticker']} — {payload['title']}",
        },
        "usage": usage,
    }


@router.get("/on-demand/usage")
async def on_demand_usage(request: Request) -> dict[str, Any]:
    user = _require_authenticated_user(request)
    pro = is_pro_subscriber(user)
    usage = get_on_demand_usage_today(int(user["id"]))
    return {"ok": True, "pro": pro, "usage": usage}
