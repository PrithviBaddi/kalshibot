"""
Daily pick context helpers: historical similarity, Kalshi 7-day trend, BLS release blocks.

News and macro briefings for the daily pick are no longer assembled here; Claude fetches
those via tools in `daily_pick_claude.py`.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

import httpx

from app.bls_data import fetch_latest_bls_series
from app.db import list_global_daily_picks_for_similarity
from app.news_context import _NEWS_STOPWORDS
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)


def _title_tokens(title: str) -> set[str]:
    return {
        w.lower()
        for w in re.findall(r"[A-Za-z0-9]+", title or "")
        if len(w) > 2 and w.lower() not in _NEWS_STOPWORDS
    }


def _is_economic_release_market(ticker: str, title: str) -> bool:
    tk = (ticker or "").strip().upper()
    prefixes = (
        "KXUSRETAIL",
        "KXCPI",
        "U3",
        "GDPUSMAX",
        "NGDP",
        "KXADP",
        "KXFED",
        "KXTERMINALRATE",
        "KXRATECUTCOUNT",
    )
    if any(tk.startswith(p) for p in prefixes):
        return True
    tl = (title or "").lower()
    return any(
        kw in tl
        for kw in (
            "retail sales",
            "consumer price index",
            "cpi",
            "unemployment",
            "jobs report",
            "gdp",
            "gross domestic product",
        )
    )


async def _economic_release_data_block(ticker: str, title: str) -> dict[str, Any]:
    """
    For economic release markets, fetch concrete BLS values (free public API).
    Currently includes RSXFS for retail sales.
    """
    if not _is_economic_release_market(ticker, title):
        return {"ok": False, "paragraph": "", "kind": None}
    tk = (ticker or "").upper()
    tl = (title or "").lower()
    if tk.startswith("KXUSRETAIL") or "retail sales" in tl:
        row = await fetch_latest_bls_series("RSXFS")
        if row.get("ok"):
            value = str(row.get("value") or "")
            month = str(row.get("period_name") or "").strip()
            year = str(row.get("year") or "").strip()
            when = f"{month} {year}".strip()
            paragraph = f"BLS reports retail sales (series RSXFS) latest value {when}: {value}."
            return {"ok": True, "kind": "retail_sales", "paragraph": paragraph, "raw": row}
    if tk.startswith("KXADP") or "adp" in tl or "private payroll" in tl:
        row = await fetch_latest_bls_series("CES0000000001")
        if row.get("ok"):
            value = str(row.get("value") or "")
            month = str(row.get("period_name") or "").strip()
            year = str(row.get("year") or "").strip()
            when = f"{month} {year}".strip()
            paragraph = (
                "BLS benchmark (series CES0000000001 total nonfarm payrolls) "
                f"latest value {when}: {value}."
            )
            return {"ok": True, "kind": "adp_payroll_benchmark", "paragraph": paragraph, "raw": row}
    return {"ok": False, "paragraph": "", "kind": None}


def _topics_overlap(a: set[str], b: set[str]) -> bool:
    if not a or not b:
        return False
    inter = a & b
    n = len(inter)
    if n >= 3:
        return True
    if n >= 2 and n >= min(len(a), len(b)) * 0.25:
        return True
    union = len(a | b) or 1
    return n / union >= 0.12


def build_historical_feedback_lines(*, current_title: str, utc_day: str, max_items: int = 4) -> tuple[list[str], int]:
    rows = list_global_daily_picks_for_similarity(before_day=utc_day, limit_rows=260)
    tok = _title_tokens(current_title)
    lines: list[str] = []
    matched = 0
    for r in rows:
        if r.get("resolved") is not True or r.get("resolution_correct") is None:
            continue
        if not _topics_overlap(tok, _title_tokens(r.get("title") or "")):
            continue
        ok = bool(r["resolution_correct"])
        label = "correct" if ok else "incorrect"
        lines.append(f"We previously analyzed a similar market ({r['day']}): our recommendation was {label}.")
        matched += 1
        if matched >= max_items:
            break
    return lines, matched


def _fp_from_priceish(obj: Any) -> float | None:
    if not isinstance(obj, dict):
        return None
    for key in ("close_dollars", "close"):
        v = obj.get(key)
        if v is None:
            continue
        try:
            return float(str(v).strip())
        except (TypeError, ValueError):
            continue
    return None


def _mid_yes_pct_from_candle(candle: dict[str, Any]) -> float | None:
    p = _fp_from_priceish(candle.get("price"))
    if p is not None:
        return round(p * 100.0, 2)
    yb = candle.get("yes_bid")
    ya = candle.get("yes_ask")
    if isinstance(yb, dict) and isinstance(ya, dict):
        b = _fp_from_priceish(yb)
        a = _fp_from_priceish(ya)
        if b is not None and a is not None:
            return round((b + a) / 2.0 * 100.0, 2)
        if b is not None:
            return round(b * 100.0, 2)
        if a is not None:
            return round(a * 100.0, 2)
    return None


async def fetch_kalshi_seven_day_trend_sentence(k: KalshiClient, market: dict[str, Any]) -> tuple[str, bool]:
    """Returns (sentence, derived_from_candles)."""
    ticker = str(market.get("ticker") or "")
    series = str(market.get("series_ticker") or "")
    if not ticker:
        return ("Kalshi price trend: missing ticker; no history fetched.", False)

    end_ts = int(time.time())
    start_ts = end_ts - 7 * 86400
    period = 1440
    data: dict[str, Any] | None = None

    try:
        if series:
            data = await k.get_market_candlesticks(
                series,
                ticker,
                start_ts=start_ts,
                end_ts=end_ts,
                period_interval=period,
                include_latest_before_start=True,
            )
    except httpx.HTTPStatusError as e:
        if e.response.status_code != 404:
            logger.warning(
                "Kalshi candlesticks failed ticker=%s status=%s body=%s",
                ticker,
                e.response.status_code,
                (e.response.text or "")[:1200],
            )
            return ("Kalshi price trend: API error; could not load 7-day history.", False)
        data = None
    except httpx.HTTPError as e:
        logger.warning("Kalshi candlesticks HTTP error ticker=%s err=%s", ticker, e)
        return ("Kalshi price trend: network error; could not load 7-day history.", False)

    if not isinstance(data, dict) or not data.get("candlesticks"):
        logger.warning("Kalshi candlesticks empty for ticker=%s response=%s", ticker, str(data)[:1200])
        try:
            data = await k.get_historical_market_candlesticks(
                ticker,
                start_ts=start_ts,
                end_ts=end_ts,
                period_interval=period,
            )
        except httpx.HTTPStatusError as e:
            logger.warning(
                "Kalshi historical candlesticks failed ticker=%s status=%s body=%s",
                ticker,
                e.response.status_code,
                (e.response.text or "")[:1200],
            )
            data = None
        except httpx.HTTPError as e:
            logger.warning("Kalshi historical candlesticks network error ticker=%s err=%s", ticker, e)
            data = None

    if not isinstance(data, dict) or not data.get("candlesticks"):
        try:
            trades_blob = await k.get_trades(ticker, limit=250)
            trades = trades_blob.get("trades") if isinstance(trades_blob, dict) else None
            if isinstance(trades, list) and len(trades) >= 2:
                prices: list[float] = []
                for tr in trades:
                    if not isinstance(tr, dict):
                        continue
                    pv = tr.get("yes_price_dollars")
                    if pv is None:
                        pv = tr.get("yes_price")
                        if pv is not None:
                            try:
                                pv = float(pv) / 100.0
                            except (TypeError, ValueError):
                                pv = None
                    try:
                        if pv is not None:
                            prices.append(float(pv) * 100.0)
                    except (TypeError, ValueError):
                        continue
                if len(prices) >= 2:
                    first_p = prices[-1]
                    last_p = prices[0]
                    if last_p > first_p:
                        return (
                            f"Kalshi price trend: recent trades moved from about {first_p:.0f}% to {last_p:.0f}% YES over the last 7 days, suggesting growing confidence in YES.",
                            True,
                        )
                    if last_p < first_p:
                        return (
                            f"Kalshi price trend: recent trades moved from about {first_p:.0f}% to {last_p:.0f}% YES over the last 7 days, suggesting weaker YES confidence (tilting toward NO).",
                            True,
                        )
                    return (
                        f"Kalshi price trend: recent trades stayed near {last_p:.0f}% YES over the last 7 days (roughly flat).",
                        True,
                    )
            logger.warning("Kalshi trades fallback empty ticker=%s response=%s", ticker, str(trades_blob)[:1200])
        except httpx.HTTPStatusError as e:
            logger.warning(
                "Kalshi trades fallback failed ticker=%s status=%s body=%s",
                ticker,
                e.response.status_code,
                (e.response.text or "")[:1200],
            )
        except httpx.HTTPError as e:
            logger.warning("Kalshi trades fallback network error ticker=%s err=%s", ticker, e)

        try:
            ob = await k.get_orderbook(ticker)
            logger.warning("Kalshi orderbook fallback used ticker=%s response=%s", ticker, str(ob)[:1200])
            yes = ob.get("orderbook", {}).get("yes") if isinstance(ob, dict) else None
            if isinstance(yes, list) and yes:
                top = yes[0]
                if isinstance(top, list) and top:
                    p = float(top[0])
                    if p > 1:
                        p = p / 100.0
                    return (
                        f"Kalshi price trend: candlestick/trade history unavailable; current orderbook implies about {p * 100.0:.0f}% YES.",
                        False,
                    )
        except Exception as e:
            logger.warning("Kalshi orderbook fallback failed ticker=%s err=%s", ticker, e)

        return ("Kalshi price trend: no usable 7-day candlestick or recent trade history for this contract.", False)

    sticks = data.get("candlesticks") or []
    points: list[tuple[int, float]] = []
    for c in sticks:
        if not isinstance(c, dict):
            continue
        ts = c.get("end_period_ts")
        mid = _mid_yes_pct_from_candle(c)
        if ts is None or mid is None:
            continue
        try:
            tsi = int(ts)
        except (TypeError, ValueError):
            continue
        points.append((tsi, mid))

    points.sort(key=lambda x: x[0])
    if len(points) < 2:
        return ("Kalshi price trend: not enough candlestick closes in the last 7 days to summarize direction.", False)

    first_p = points[0][1]
    last_p = points[-1][1]
    delta = last_p - first_p
    if abs(delta) < 0.75:
        sentence = (
            f"Kalshi price trend: YES probability stayed near {last_p:.0f}% over the last 7 days "
            "(roughly flat — no strong directional move in the daily series)."
        )
    elif delta > 0:
        sentence = (
            f"Kalshi price trend: moved from about {first_p:.0f}% to {last_p:.0f}% YES over the last 7 days, "
            "suggesting growing confidence in YES."
        )
    else:
        sentence = (
            f"Kalshi price trend: moved from about {first_p:.0f}% to {last_p:.0f}% YES over the last 7 days, "
            "suggesting weaker YES confidence (pricing tilting toward NO)."
        )
    return (sentence, True)


async def build_daily_pick_briefing(
    k: KalshiClient,
    *,
    market: dict[str, Any],
    title: str,
    utc_day: str,
    pick_category: str = "",
) -> dict[str, Any]:
    """
    Minimal briefing for the daily pick job: historical lines only.

    Kalshi trend, news, FRED, BLS, and expert context are fetched by Claude via tools on demand.
    """
    _ = (k, market, pick_category)

    sources: list[str] = []
    hist_lines, hist_n = build_historical_feedback_lines(current_title=title, utc_day=utc_day)
    if hist_n > 0:
        sources.append(f"historical_context_{hist_n}_matches")

    if hist_lines:
        hist_section = "\n".join(f"- {ln}" for ln in hist_lines)
    else:
        hist_section = "- No closely related resolved picks in our database."

    briefing = f"""## Similar past picks (internal only)
{hist_section}
"""

    news_stub: dict[str, Any] = {
        "configured": True,
        "ok": False,
        "mode": "agentic_claude",
        "headlines": [],
        "prompt_block": "Claude gathers news via the web_search tool during analysis.",
        "queries": [],
        "rss": None,
    }

    return {
        "briefing": briefing.strip(),
        "sources_used": sources,
        "news": news_stub,
        "fred": {},
        "bls": {},
        "expert": {"ok": False, "found": False, "prompt_line": ""},
        "price_trend_line": None,
        "historical_lines": hist_lines,
    }
