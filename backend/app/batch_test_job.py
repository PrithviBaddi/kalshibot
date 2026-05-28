"""Background batch calibration: scan categories, evaluate top N with full Claude pipeline."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from app.daily_pick_job import evaluate_market_for_pick, gather_top_scored_candidates
from app.db import insert_batch_test_pick
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)

_DEFAULT_CATEGORIES = ("Politics", "Economics", "Financials")
_BATCH_CONCURRENCY = max(1, int(os.getenv("BATCH_TEST_CONCURRENCY", "3")))


async def run_batch_analyze_background(
    run_id: str,
    categories: list[str] | None,
    *,
    top_n: int = 30,
) -> dict[str, Any]:
    cats = [c.strip() for c in (categories or list(_DEFAULT_CATEGORIES)) if c.strip()]
    if not cats:
        cats = list(_DEFAULT_CATEGORIES)

    k: KalshiClient | None = None
    evaluated = 0
    skipped = 0
    errors: list[dict[str, str]] = []

    try:
        k = KalshiClient()
        candidates = await gather_top_scored_candidates(k, cats, top_n=top_n)
        logger.info(
            "batch_test: run_id=%s evaluating %s candidates from categories=%s",
            run_id,
            len(candidates),
            cats,
        )
        sem = asyncio.Semaphore(_BATCH_CONCURRENCY)

        async def _one(row: dict[str, Any]) -> None:
            nonlocal evaluated, skipped
            ticker = str(row["scan"].get("ticker") or row["market"].get("ticker") or "").strip()
            if not ticker:
                skipped += 1
                return
            cat = str(row.get("source_category") or row["market"].get("category") or "Unknown")
            scanner_title = str(row["market"].get("title") or "")
            async with sem:
                try:
                    result = await evaluate_market_for_pick(
                        k,
                        ticker,
                        pick_category=cat,
                        scanner_title=scanner_title,
                    )
                except Exception as e:
                    logger.exception("batch_test: evaluate failed ticker=%s", ticker)
                    errors.append({"ticker": ticker, "error": str(e)})
                    skipped += 1
                    return
            if not result:
                skipped += 1
                return
            market = result.get("market") or {}
            title = str(market.get("title") or ticker)
            insert_batch_test_pick(
                run_id=run_id,
                ticker=ticker,
                title=title,
                category=cat,
                market_implied_yes=float(result.get("implied") or 0.0),
                model_yes_probability=float(result.get("model_yes") or 0.0),
                confidence_score=result.get("confidence_score"),
                edge=float(result.get("edge") or 0.0),
                recommended_action=str(result.get("recommended_action") or "PASS"),
                reasoning=str(result.get("reasoning") or ""),
                context_sources_used=list(result.get("context_sources_used") or []),
            )
            evaluated += 1

        await asyncio.gather(*[_one(row) for row in candidates])
        return {
            "ok": True,
            "run_id": run_id,
            "candidates": len(candidates),
            "evaluated": evaluated,
            "skipped": skipped,
            "errors": errors,
        }
    finally:
        if k is not None:
            await k.aclose()
