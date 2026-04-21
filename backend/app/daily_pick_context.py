"""
Enriched structured briefing for daily pick: Kalshi trend, multi-query news, expert sites, past picks.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

import httpx

from app.bls_data import fetch_latest_bls_series
from app.db import list_global_daily_picks_for_similarity
from app.fred_data import fetch_fred_economic_context
from app.news_context import (
    _NEWS_STOPWORDS,
    _headline_relevance_score,
    daily_pick_query_words,
    fetch_expert_forecast_block,
    fetch_news_triple_for_daily_pick,
)
from app.news_rss import fetch_rss_for_daily_pick
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)


def _title_tokens(title: str) -> set[str]:
    return {
        w.lower()
        for w in re.findall(r"[A-Za-z0-9]+", title or "")
        if len(w) > 2 and w.lower() not in _NEWS_STOPWORDS
    }


def _headline_similar(a: str, b: str) -> bool:
    if (a or "").casefold() == (b or "").casefold():
        return True
    ta = {w for w in re.findall(r"[A-Za-z0-9]+", (a or "").lower()) if len(w) > 2}
    tb = {w for w in re.findall(r"[A-Za-z0-9]+", (b or "").lower()) if len(w) > 2}
    if not ta or not tb:
        return False
    inter = len(ta & tb)
    union = len(ta | tb) or 1
    return inter / union >= 0.55


def merge_news_and_rss_headlines(
    news: dict[str, Any],
    rss: dict[str, Any],
    title: str,
    ticker: str = "",
) -> dict[str, Any]:
    """
    Combine NewsAPI + RSS headlines, dedupe similar titles, keep top 10 by relevance score.
    """
    qw = daily_pick_query_words(title, ticker=ticker)
    combined: list[dict[str, Any]] = []

    for h in news.get("headlines") or []:
        if not isinstance(h, dict):
            continue
        t = str(h.get("title") or "").strip()
        if not t:
            continue
        combined.append(
            {
                "title": t[:500],
                "source": str(h.get("source") or "NewsAPI")[:160],
                "published_at": str(h.get("published_at") or ""),
                "origin": "newsapi",
                "relevance_score": _headline_relevance_score(t, qw),
            }
        )

    for h in rss.get("headlines") or []:
        if not isinstance(h, dict):
            continue
        t = str(h.get("title") or "").strip()
        if not t:
            continue
        combined.append(
            {
                "title": t[:500],
                "source": str(h.get("source") or "RSS")[:160],
                "published_at": str(h.get("published_at") or ""),
                "origin": "rss",
                "relevance_score": _headline_relevance_score(t, qw),
            }
        )

    combined.sort(
        key=lambda x: (int(x.get("relevance_score") or 0), str(x.get("published_at") or "")),
        reverse=True,
    )

    picked: list[dict[str, str]] = []
    for row in combined:
        t = str(row.get("title") or "").strip()
        if int(row.get("relevance_score") or 0) <= 0:
            continue
        if any(_headline_similar(t, p["title"]) for p in picked):
            continue
        picked.append(
            {
                "title": t[:500],
                "source": str(row.get("source") or "")[:160],
                "published_at": str(row.get("published_at") or ""),
            }
        )
        if len(picked) >= 10:
            break

    rss_title_cf = {str(h.get("title") or "").casefold() for h in rss.get("headlines") or [] if isinstance(h, dict)}
    final_cf = {p["title"].casefold() for p in picked}
    rss_contributed = bool(rss_title_cf & final_cf)

    lines = [f"[{h['source']}, {h['published_at']}]: {h['title']}" for h in picked]
    prompt_block = "\n".join(lines) if lines else "No recent headlines found for this topic."

    return {
        "headlines": picked,
        "prompt_block": prompt_block,
        "rss_contributed": rss_contributed,
        "combined_ok": bool(picked),
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
        # Fallback 1: recent trades endpoint (best-effort)
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

        # Fallback 2: current orderbook snapshot (very weak substitute, but explicit).
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
    Assemble structured briefing text + `sources_used` tags + raw news/expert blobs for persistence.
    """
    sources: list[str] = []

    trend_line, trend_ok = await fetch_kalshi_seven_day_trend_sentence(k, market)
    if trend_ok:
        sources.append("kalshi_price_history")
    else:
        sources.append("kalshi_price_history_unavailable")

    ticker = str(market.get("ticker") or "")
    news_raw = await fetch_news_triple_for_daily_pick(title, ticker=ticker)
    rss_raw = await asyncio.to_thread(fetch_rss_for_daily_pick, title, ticker)
    merged = merge_news_and_rss_headlines(news_raw, rss_raw, title, ticker=ticker)
    news = {
        **news_raw,
        "headlines": merged["headlines"],
        "prompt_block": merged["prompt_block"],
        "ok": bool(merged.get("combined_ok"))
        or bool(news_raw.get("ok"))
        or bool(rss_raw.get("ok")),
        "rss": rss_raw,
    }
    if merged.get("rss_contributed"):
        sources.append("rss_feeds")

    news_ok_count = int(news_raw.get("api_ok_count") or 0)
    if news_ok_count >= 3:
        sources.append("newsapi_3_queries")
    elif news_ok_count >= 1:
        sources.append(f"newsapi_{news_ok_count}_of_3_queries")

    fred_block: dict[str, Any] = {"ok": False, "paragraph": ""}
    cat = (pick_category or "").strip()
    if cat in ("Economics", "Financials"):
        fred_block = await fetch_fred_economic_context()
        if fred_block.get("ok") and str(fred_block.get("paragraph") or "").strip():
            sources.append("fred_economic_data")
            tk_up = (ticker or "").upper()
            if tk_up.startswith(("KXFED", "KXTERMINALRATE", "KXRATECUTCOUNT")):
                sources.append("fred_fedfunds_for_rate_market")

    bls_block = await _economic_release_data_block(ticker, title)
    if bls_block.get("ok") and str(bls_block.get("paragraph") or "").strip():
        sources.append("bls_release_data")

    expert = await fetch_expert_forecast_block(title)
    if expert.get("ok"):
        if expert.get("found"):
            sources.append("metaculus_forecast_found")
        else:
            sources.append("expert_forecast_none")

    hist_lines, hist_n = build_historical_feedback_lines(current_title=title, utc_day=utc_day)
    if hist_n > 0:
        sources.append(f"historical_context_{hist_n}_matches")

    news_block = str(news.get("prompt_block") or "No recent headlines found for this topic.")
    fred_line = str(fred_block.get("paragraph") or "").strip()
    bls_line = str(bls_block.get("paragraph") or "").strip()
    expert_line = str(expert.get("prompt_line") or "")
    if not expert_line:
        expert_line = (
            "Expert / crowd forecasts: No clear Metaculus / Manifold / Polymarket headline estimate found in recent search results."
        )

    if hist_lines:
        hist_section = "\n".join(f"- {ln}" for ln in hist_lines)
    else:
        hist_section = "- No closely related resolved picks in our database."

    fred_section = ""
    if fred_line:
        fred_section = f"\n### US macro data (FRED — hard numbers)\n{fred_line}\n"
    bls_section = ""
    if bls_line:
        bls_section = f"\n### Economic release data (BLS direct)\n{bls_line}\n"

    briefing = f"""## Structured context for this pick

### Kalshi price action (7 days)
{trend_line}

### Recent news (NewsAPI + RSS; merged, deduped; top headlines for this topic)
{news_block}
{fred_section}
{bls_section}
### Expert / crowd forecasting sites (Metaculus, Manifold, Polymarket — headline scan)
{expert_line}

### Our historical context (similar past picks)
{hist_section}
"""

    return {
        "briefing": briefing.strip(),
        "sources_used": sources,
        "news": news,
        "fred": fred_block,
        "bls": bls_block,
        "expert": expert,
        "price_trend_line": trend_line,
        "historical_lines": hist_lines,
    }
