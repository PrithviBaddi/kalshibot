"""
Background resolution checker: poll Kalshi for settled markets and record outcomes.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.db import (
    apply_automatic_batch_test_resolution,
    apply_automatic_daily_pick_resolution,
    list_unresolved_batch_test_picks,
    list_unresolved_daily_picks,
)
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)

# Kalshi uses varying terminal labels; accept any that imply a final YES/NO result is present.
_SETTLED_STATUSES = frozenset({"determined", "finalized", "settled", "resolved"})


def _coerce_market(payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    m = payload.get("market")
    if isinstance(m, dict):
        return m
    if payload.get("ticker"):
        return payload
    return None


def _binary_settlement_outcome(m: dict[str, Any]) -> str | None:
    """Kalshi `result`: yes | no | scalar | '' — return YES/NO for binary markets."""
    mt = str(m.get("market_type") or "binary").lower()
    if mt != "binary":
        return None
    r = str(m.get("result") or "").strip().lower()
    if r == "yes":
        return "YES"
    if r == "no":
        return "NO"
    return None


def _market_settled_for_autoresolve(m: dict[str, Any]) -> bool:
    status = str(m.get("status") or "").lower()
    if status not in _SETTLED_STATUSES:
        return False
    return _binary_settlement_outcome(m) is not None


def _resolution_correct_for_pick(
    recommended_action: str | None,
    outcome_yes_no: str,
) -> bool | None:
    a = (recommended_action or "PASS").upper().replace(" ", "_").replace("-", "_")
    if a == "PASS":
        return None
    if a == "BUY_YES":
        return outcome_yes_no == "YES"
    if a == "BUY_NO":
        return outcome_yes_no == "NO"
    return None


async def run_daily_pick_resolution_check(k: KalshiClient) -> dict[str, Any]:
    """
    For each row with resolved IS NULL, fetch market; if finalized/determined with YES/NO outcome, update DB.
    """
    rows = list_unresolved_daily_picks()
    updated: list[str] = []
    skipped: list[str] = []
    errors: list[dict[str, str]] = []

    for row in rows:
        day = str(row["day"])
        ticker = str(row["ticker"] or "").strip()
        action = row.get("recommended_action")
        if not ticker:
            skipped.append(day)
            continue
        try:
            data = await k.get_market(ticker)
        except httpx.HTTPStatusError as e:
            err = f"http_{e.response.status_code}"
            logger.warning(
                "daily_pick_resolution: get_market failed day=%s ticker=%s status=%s body=%s",
                day,
                ticker,
                e.response.status_code,
                (e.response.text or "")[:800],
            )
            errors.append({"day": day, "ticker": ticker, "error": err})
            continue
        except httpx.HTTPError as e:
            logger.warning("daily_pick_resolution: get_market network day=%s ticker=%s err=%s", day, ticker, e)
            errors.append({"day": day, "ticker": ticker, "error": str(e)})
            continue

        m = _coerce_market(data if isinstance(data, dict) else {})
        if not m:
            skipped.append(day)
            continue

        if not _market_settled_for_autoresolve(m):
            skipped.append(day)
            continue

        outcome = _binary_settlement_outcome(m)
        if not outcome:
            skipped.append(day)
            continue

        rc = _resolution_correct_for_pick(
            str(action) if action is not None else None,
            outcome,
        )
        now = int(time.time())
        if apply_automatic_daily_pick_resolution(
            day=day,
            resolution_result=outcome,
            resolution_correct=rc,
            resolved_at=now,
        ):
            updated.append(day)
            logger.info(
                "daily_pick_resolution: recorded day=%s ticker=%s outcome=%s action=%s correct=%s",
                day,
                ticker,
                outcome,
                action,
                rc,
            )
        else:
            skipped.append(day)

    batch_rows = list_unresolved_batch_test_picks()
    batch_updated: list[int] = []
    batch_skipped = 0

    for row in batch_rows:
        pick_id = int(row["id"])
        ticker = str(row["ticker"] or "").strip()
        action = row.get("recommended_action")
        if not ticker:
            batch_skipped += 1
            continue
        try:
            data = await k.get_market(ticker)
        except httpx.HTTPStatusError as e:
            errors.append({"batch_pick_id": pick_id, "ticker": ticker, "error": f"http_{e.response.status_code}"})
            continue
        except httpx.HTTPError as e:
            errors.append({"batch_pick_id": pick_id, "ticker": ticker, "error": str(e)})
            continue

        m = _coerce_market(data if isinstance(data, dict) else {})
        if not m or not _market_settled_for_autoresolve(m):
            batch_skipped += 1
            continue

        outcome = _binary_settlement_outcome(m)
        if not outcome:
            batch_skipped += 1
            continue

        rc = _resolution_correct_for_pick(
            str(action) if action is not None else None,
            outcome,
        )
        now = int(time.time())
        if apply_automatic_batch_test_resolution(
            pick_id=pick_id,
            resolution_result=outcome,
            resolution_correct=rc,
            resolved_at=now,
        ):
            batch_updated.append(pick_id)
            logger.info(
                "batch_test_resolution: pick_id=%s ticker=%s outcome=%s correct=%s",
                pick_id,
                ticker,
                outcome,
                rc,
            )
        else:
            batch_skipped += 1

    return {
        "checked": len(rows),
        "updated": updated,
        "skipped": len(skipped),
        "batch_checked": len(batch_rows),
        "batch_updated": batch_updated,
        "batch_skipped": batch_skipped,
        "errors": errors,
    }
