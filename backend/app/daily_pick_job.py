"""
One shared daily recommendation for all Free-tier users.

Uses **server** Kalshi env keys (`KALSHI_API_KEY_ID` + PEM path or `KALSHI_PRIVATE_KEY`),
even when KALSHIBOT_USER_AUTH=1, so the job can run without any user’s credentials.
"""

from __future__ import annotations

import calendar
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.analysis import build_market_analysis
from app.daily_pick_claude import enrich_daily_pick_with_claude
from app.daily_pick_context import build_daily_pick_briefing
from app.db import _utc_day_string, get_global_daily_pick, upsert_global_daily_pick
from app.scanner import dedupe_markets_by_ticker, summarize_market
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)

_MIN_VOLUME = 1000.0
_MAX_SPREAD = 0.08
_MAX_SPREAD_RELAXED = 0.15
_MIN_FILTERED_BEFORE_SPREAD_RELAX = 3
_MAX_DAYS_TO_RESOLVE = 90
_TOP_CANDIDATES_TO_EVALUATE = 5
_MIN_MID_PROB = 0.15
_MAX_MID_PROB = 0.85
_SPORTS_TERMS = ("sport", "nba", "nfl", "mlb", "nhl", "soccer", "ncaa", "tennis", "golf", "mma", "ufc")
_NARROW_BAND_TITLE_RE = re.compile(r"\bbetween\s+\d+(?:\.\d+)?\s+and\s+\d+(?:\.\d+)?\b", re.IGNORECASE)
_NARROW_BAND_TICKER_RE = re.compile(r"H\d{4}")
_EXCLUDED_PREFIXES = ("KXSP500ADD", "KXSP500REMOVE")
_FINANCIALS_PRIORITY_PREFIXES = ("KXFED", "KXTERMINALRATE", "KXCOIN", "KXBTC", "KXOIL")

# UTC weekday: Mon=0 … Sun=6. Sun runs a 3-way tournament (highest pool score wins).
_WEEKDAY_TO_CATEGORY: dict[int, str] = {
    0: "Politics",
    1: "Economics",
    2: "Financials",
    3: "Politics",
    4: "Economics",
    5: "Financials",
}
_SUNDAY_CATEGORIES = ("Politics", "Economics", "Financials")


def _to_dt(v: Any) -> datetime | None:
    s = str(v or "").strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _is_non_sports(m: dict[str, Any]) -> bool:
    blob = " ".join(
        str(m.get(k) or "")
        for k in ("category", "title", "subtitle", "event_ticker", "series_ticker")
    ).lower()
    return not any(term in blob for term in _SPORTS_TERMS)


def _is_binary_non_combo(m: dict[str, Any]) -> bool:
    t = (str(m.get("title") or "") + " " + str(m.get("subtitle") or "")).lower()
    if "parlay" in t or "combo" in t:
        return False
    legs = m.get("legs")
    if isinstance(legs, list) and len(legs) > 1:
        return False
    try:
        if int(m.get("leg_count") or 0) > 1:
            return False
    except (TypeError, ValueError):
        pass

    # Require YES/NO quote fields to exist in some form.
    has_yes_no = any(k in m for k in ("yes_bid_dollars", "yes_ask_dollars", "yes_bid", "yes_ask"))
    if not has_yes_no:
        return False
    return True


def _resolves_within_days(m: dict[str, Any], days: int) -> bool:
    now = datetime.now(timezone.utc)
    close = _to_dt(m.get("close_time") or m.get("expiration_time") or m.get("end_date"))
    if close is None:
        return False
    return now <= close <= (now + timedelta(days=days))


def _is_excluded_narrow_band_or_committee_market(m: dict[str, Any]) -> bool:
    ticker = str(m.get("ticker") or "").upper().strip()
    title = str(m.get("title") or "")
    if ticker.startswith(_EXCLUDED_PREFIXES):
        return True
    if _NARROW_BAND_TICKER_RE.search(ticker):
        return True
    if _NARROW_BAND_TITLE_RE.search(title):
        return True
    return False


def _financials_priority_boost(m: dict[str, Any]) -> int:
    ticker = str(m.get("ticker") or "").upper().strip()
    return 1 if ticker.startswith(_FINANCIALS_PRIORITY_PREFIXES) else 0


def _filter_candidates(markets: list[dict[str, Any]], *, max_spread: float, pick_category: str = "") -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for m in markets:
        if not _is_binary_non_combo(m):
            continue
        if not _is_non_sports(m):
            continue
        if _is_excluded_narrow_band_or_committee_market(m):
            continue
        if not _resolves_within_days(m, _MAX_DAYS_TO_RESOLVE):
            continue
        s = summarize_market(m)
        mid = float(s.get("mid_prob") or 0.0)
        if mid < _MIN_MID_PROB or mid > _MAX_MID_PROB:
            continue
        if float(s.get("volume") or 0) < _MIN_VOLUME:
            continue
        if float(s.get("spread") or 1.0) >= max_spread:
            continue
        rows.append({"market": m, "scan": s, "priority_boost": _financials_priority_boost(m)})

    cat = (pick_category or "").strip().lower()
    if cat == "financials":
        rows.sort(
            key=lambda x: (
                int(x.get("priority_boost") or 0),
                float(x["scan"].get("score") or 0),
                float(x["scan"].get("volume") or 0),
            ),
            reverse=True,
        )
    else:
        rows.sort(key=lambda x: (float(x["scan"].get("score") or 0), float(x["scan"].get("volume") or 0)), reverse=True)
    return rows


async def _gather_filtered_for_category(
    k: KalshiClient,
    category: str,
) -> tuple[list[dict[str, Any]], bool, int]:
    """
    Pull open markets for one Kalshi category, apply Step-2 filters, optionally relax spread.
    Returns (filtered rows, spread_relaxed, deduped_market_count).
    """
    ser = await k.get_series_list(category=category)
    series_list = ser.get("series") or []
    all_markets: list[dict[str, Any]] = []
    max_series = int(os.getenv("DAILY_PICK_MAX_SERIES", "80"))
    per_limit = int(os.getenv("DAILY_PICK_MARKETS_PER_SERIES", "100"))
    for s in series_list[:max_series]:
        st = s.get("ticker")
        if not st:
            continue
        d = await k.get_markets(limit=per_limit, series_ticker=str(st), mve_filter="exclude")
        all_markets.extend(d.get("markets") or [])

    markets = dedupe_markets_by_ticker(all_markets)
    filtered = _filter_candidates(markets, max_spread=_MAX_SPREAD, pick_category=category)
    spread_relaxed = False
    if len(filtered) < _MIN_FILTERED_BEFORE_SPREAD_RELAX:
        logger.warning(
            "Daily pick %s: only %d candidates with max_spread=%.2f; relaxing max_spread to %.2f",
            category,
            len(filtered),
            _MAX_SPREAD,
            _MAX_SPREAD_RELAXED,
        )
        filtered = _filter_candidates(markets, max_spread=_MAX_SPREAD_RELAXED, pick_category=category)
        spread_relaxed = True
    return filtered, spread_relaxed, len(markets)


def _pool_quality_score(filtered: list[dict[str, Any]]) -> float:
    """Sum scanner scores of top candidates — used to compare categories on Sundays."""
    return sum(float(x["scan"].get("score") or 0.0) for x in filtered[:30])


async def _sunday_select_category_and_pool(
    k: KalshiClient,
) -> tuple[str, list[dict[str, Any]], bool, dict[str, Any]]:
    meta: dict[str, Any] = {
        "mode": "sunday_tournament",
        "compared": list(_SUNDAY_CATEGORIES),
        "scores": {},
    }
    best_cat: str | None = None
    best_filtered: list[dict[str, Any]] = []
    best_relaxed = False
    best_key = (-1.0, -1)

    for cat in _SUNDAY_CATEGORIES:
        filtered, spread_relaxed, raw_n = await _gather_filtered_for_category(k, cat)
        pq = _pool_quality_score(filtered) if filtered else -1.0
        meta["scores"][cat] = {
            "pool_quality_score": pq,
            "pool_size": len(filtered),
            "raw_markets": raw_n,
            "spread_relaxed": spread_relaxed,
        }
        key = (pq, len(filtered))
        if filtered and key > best_key:
            best_key = key
            best_cat = cat
            best_filtered = filtered
            best_relaxed = spread_relaxed

    if not best_cat or not best_filtered:
        raise RuntimeError(
            "Sunday tournament: no candidate markets passed filters in Politics, Economics, or Financials."
        )
    meta["winner"] = best_cat
    meta["winner_pool_quality_score"] = best_key[0]
    logger.info(
        "Daily pick Sunday tournament: winner=%s pool_quality=%.4f pool_size=%d",
        best_cat,
        best_key[0],
        len(best_filtered),
    )
    return best_cat, best_filtered, best_relaxed, meta


async def _fetch_market(k: KalshiClient, ticker: str) -> dict[str, Any]:
    try:
        data = await k.get_market(ticker)
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Kalshi get_market failed for {ticker}: {e}") from e
    market = data.get("market") if isinstance(data, dict) else None
    if isinstance(market, dict):
        return market
    if isinstance(data, dict) and data.get("ticker"):
        return data
    raise RuntimeError(f"Unexpected Kalshi market shape for {ticker}")


async def _evaluate_one_candidate(k: KalshiClient, ticker: str, utc_day: str, pick_category: str = "") -> dict[str, Any]:
    market = await _fetch_market(k, ticker)
    analysis = build_market_analysis(market)
    implied = float(analysis.get("implied_yes_probability") or 0.0)
    title = str(analysis.get("title") or "")

    briefing_pack = await build_daily_pick_briefing(
        k,
        market=market,
        title=title,
        utc_day=utc_day,
        pick_category=pick_category,
    )
    hist_lines = list(briefing_pack.get("historical_lines") or [])
    sources_used: list[str] = list(briefing_pack.get("sources_used") or [])
    news_daily = briefing_pack.get("news") or {}
    prompt_block = str(news_daily.get("prompt_block") or "")
    analysis["news"] = {
        "configured": news_daily.get("configured"),
        "ok": news_daily.get("ok"),
        "queries": news_daily.get("queries"),
        "headlines": news_daily.get("headlines", []),
        "prompt_block": prompt_block,
        "rss": news_daily.get("rss"),
    }
    analysis["fred_macro"] = briefing_pack.get("fred") or {}
    analysis["bls_release"] = briefing_pack.get("bls") or {}
    analysis["expert_forecast"] = briefing_pack.get("expert")
    analysis["price_trend_summary"] = briefing_pack.get("price_trend_line")
    analysis["historical_feedback"] = hist_lines

    enriched, raw, tool_tags = await enrich_daily_pick_with_claude(
        analysis,
        market,
        k=k,
        historical_lines=hist_lines,
    )
    if tool_tags:
        sources_used.extend(tool_tags)
    used_claude = enriched is not None
    if used_claude:
        analysis = enriched
        rh2 = analysis.get("claude_research_headlines")
        if isinstance(rh2, list) and rh2 and isinstance(analysis.get("news"), dict):
            analysis["news"] = {**analysis["news"], "headlines": rh2[:12], "ok": True}

    model_y = float(analysis.get("model_yes_probability") or implied)
    edge = float(analysis.get("edge", model_y - implied))
    cs_raw = analysis.get("confidence_score")
    confidence_score = int(float(cs_raw)) if cs_raw is not None else None
    rec = str(analysis.get("recommended_action") or "PASS").upper().replace("-", "_").replace(" ", "_")
    if rec not in ("BUY_YES", "BUY_NO", "PASS"):
        rec = "PASS"
    reasoning = str(analysis.get("reasoning") or analysis.get("rationale") or "").strip()

    research_h = analysis.get("claude_research_headlines")
    headlines_out: list[Any] = research_h if isinstance(research_h, list) and research_h else list(
        news_daily.get("headlines") or []
    )

    return {
        "ticker": ticker,
        "market": market,
        "analysis": analysis,
        "implied": implied,
        "model_yes": model_y,
        "edge": edge,
        "confidence_score": confidence_score,
        "recommended_action": rec,
        "reasoning": reasoning,
        "used_claude": used_claude,
        "raw_claude": raw,
        "headlines": headlines_out,
        "prompt_block": prompt_block,
        "context_sources_used": sources_used,
    }


def _normalize_action_pick(raw: str) -> str:
    s = (raw or "").upper().strip().replace(" ", "_").replace("-", "_")
    if s in ("BUY_YES", "BUY_NO", "PASS"):
        return s
    return "PASS"


def _pick_best_result(results: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Candidates already have server PASS rules applied (`apply_daily_pick_pass_rules`).
    Prefer any BUY_YES/BUY_NO; tie-break by largest |edge|. Otherwise highest confidence, forced PASS.
    """
    eligible: list[dict[str, Any]] = []
    for r in results:
        ra = _normalize_action_pick(str(r.get("recommended_action") or "PASS"))
        if ra in ("BUY_YES", "BUY_NO"):
            eligible.append(r)

    if eligible:
        best = max(eligible, key=lambda x: abs(float(x.get("edge") or 0.0)))
        best["selection_reason"] = "largest_abs_edge_among_actionable"
        return best

    best = max(results, key=lambda x: int(x.get("confidence_score") or 0))
    best["recommended_action"] = "PASS"
    best["selection_reason"] = "no_candidate_with_buy_after_pass_rules"
    return best


async def run_daily_pick_generation() -> dict[str, Any]:
    """
    Step 2 selection:
    - Filter to binary, non-combo, non-sports, volume >= 1000, spread < 0.08 (or 0.15 fallback), resolve <= 90 days.
    - Score candidates by scanner quality, run Claude on top 5, choose largest actionable edge.
    """
    day = _utc_day_string()
    if get_global_daily_pick(day):
        logger.info("run_daily_pick_generation: skip — pick already exists for %s", day)
        return {"ok": True, "skipped": True, "day": day}

    forced = os.getenv("DAILY_PICK_CATEGORY", "").strip()
    now_utc = datetime.now(timezone.utc)
    wd = now_utc.weekday()

    k: KalshiClient | None = None
    try:
        k = KalshiClient()
    except ValueError as e:
        raise RuntimeError(
            "Set KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY_PATH (or KALSHI_PRIVATE_KEY) on the server "
            "so the daily pick job can reach Kalshi."
        ) from e

    try:
        rotation_meta: dict[str, Any]
        if forced:
            category = forced
            rotation_meta = {
                "mode": "env_override",
                "category": category,
                "note": "DAILY_PICK_CATEGORY overrides weekday rotation",
            }
            filtered, spread_relaxed, _raw_n = await _gather_filtered_for_category(k, category)
            logger.info("Daily pick using env category=%s (override)", category)
        elif wd == 6:
            category, filtered, spread_relaxed, rotation_meta = await _sunday_select_category_and_pool(k)
        else:
            category = _WEEKDAY_TO_CATEGORY[wd]
            rotation_meta = {
                "mode": "weekday_rotation",
                "utc_weekday": calendar.day_name[wd],
                "utc_weekday_index": wd,
                "category": category,
            }
            filtered, spread_relaxed, _raw_n = await _gather_filtered_for_category(k, category)
            logger.info(
                "Daily pick weekday rotation: %s → category=%s (pool_size=%d)",
                calendar.day_name[wd],
                category,
                len(filtered),
            )

        spread_used = _MAX_SPREAD_RELAXED if spread_relaxed else _MAX_SPREAD
        spread_relaxed_fallback = spread_relaxed

        if not filtered:
            raise RuntimeError(
                f"No markets passed Step-2 filters for {category} (binary/non-sports/volume/spread/<=90 days)."
            )

        top = filtered[:_TOP_CANDIDATES_TO_EVALUATE]
        eval_results: list[dict[str, Any]] = []
        for row in top:
            ticker = str(row["scan"].get("ticker") or row["market"].get("ticker") or "")
            if not ticker:
                continue
            try:
                res = await _evaluate_one_candidate(k, ticker, day, category)
                eval_results.append(res)
            except Exception as e:
                logger.warning("Daily pick candidate failed ticker=%s err=%s", ticker, e)

        if not eval_results:
            raise RuntimeError("Could not evaluate any top candidate with Claude.")

        selected = _pick_best_result(eval_results)
        market = selected["market"]
        analysis = selected["analysis"]
        implied = float(selected["implied"])
        model_y = float(selected["model_yes"])
        edge_val = float(selected.get("edge") or 0.0)
        conf_score = selected.get("confidence_score")
        rec_action = str(selected.get("recommended_action") or "PASS")
        raw_claude = selected.get("raw_claude")
        used_claude = bool(selected.get("used_claude"))
        reasoning_text = str(selected.get("reasoning") or "").strip()

        lean = "YES" if model_y >= implied else "NO"
        summary = f"{rec_action}: {reasoning_text[:1600]}".strip() if reasoning_text else f"{rec_action}: No rationale returned."

        conf_f = float(analysis.get("confidence")) if analysis.get("confidence") is not None else None

        pick_payload: dict[str, Any] = {
            "analysis": analysis,
            "lean": lean,
            "used_claude": used_claude,
            "headlines_used": selected.get("headlines", []),
            "context_sources_used": list(selected.get("context_sources_used") or []),
            "selection": {
                "method": "largest_edge_top5",
                "pool_size": len(filtered),
                "evaluated": len(eval_results),
                "reason": selected.get("selection_reason"),
                "constraints": {
                    "min_volume": _MIN_VOLUME,
                    "max_spread": spread_used,
                    "max_spread_primary": _MAX_SPREAD,
                    "spread_relaxed_fallback": spread_relaxed_fallback,
                    "max_days_to_resolve": _MAX_DAYS_TO_RESOLVE,
                    "min_mid_probability": _MIN_MID_PROB,
                    "max_mid_probability": _MAX_MID_PROB,
                    "excluded": "sports+combo",
                },
            },
            "disclaimer": (
                "Educational only. Not financial advice. Prediction markets can lose your entire stake. "
                "Past picks are not indicative of future results."
            ),
            "category_scanned": category,
            "category_rotation": rotation_meta,
        }

        now = int(time.time())
        upsert_global_daily_pick(
            day=day,
            ticker=str(selected.get("ticker") or market.get("ticker") or ""),
            title=str(analysis.get("title") or market.get("title") or selected.get("ticker") or ""),
            summary=summary[:2000],
            confidence=conf_f,
            pick=pick_payload,
            created_at=now,
            market_implied_yes=implied,
            model_yes_probability=model_y,
            confidence_score=int(conf_score) if conf_score is not None else None,
            edge=edge_val,
            recommended_action=rec_action,
            reasoning=reasoning_text[:4000] if reasoning_text else None,
            context_sources_used=list(selected.get("context_sources_used") or []),
        )

        out: dict[str, Any] = {
            "day": day,
            "ticker": str(selected.get("ticker") or market.get("ticker") or ""),
            "title": str(analysis.get("title") or market.get("title") or selected.get("ticker") or ""),
            "summary": summary[:2000],
            "confidence": conf_f,
            "market_implied_yes": implied,
            "model_yes_probability": model_y,
            "confidence_score": int(conf_score) if conf_score is not None else None,
            "edge": edge_val,
            "recommended_action": rec_action,
            "reasoning": reasoning_text[:4000] if reasoning_text else None,
            "context_sources_used": list(selected.get("context_sources_used") or []),
            "pick": pick_payload,
            "created_at": now,
        }
        if raw_claude:
            out["claude_raw_response"] = raw_claude
        out["category_scanned"] = category
        out["category_rotation"] = rotation_meta
        return out
    finally:
        if k is not None:
            await k.aclose()
