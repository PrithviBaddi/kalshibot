"""
Stage 12C — Optional NewsAPI.org headlines for /api/v1/analysis/market.

If NEWS_API_KEY is set, fetches a few recent articles matching a query derived from the market title.
Headlines are attached to the analysis payload and passed to Claude when enrichment runs.
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_SEC = 300.0
_MAX_HEADLINES = 8


def build_news_query(title: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", title or "")
    if not words:
        return ""
    return " ".join(words[:14])[:220]


async def fetch_news_block(title: str) -> dict[str, Any]:
    """
    Returns a small JSON-serializable block for the analysis response.
    """
    key = os.getenv("NEWS_API_KEY", "").strip()
    q = build_news_query(title)
    base: dict[str, Any] = {
        "configured": bool(key),
        "query": q,
        "headlines": [],
    }
    if not key:
        base["ok"] = False
        return base
    if not q:
        base["ok"] = False
        return base

    now = time.monotonic()
    ck = q.casefold()
    if ck in _CACHE:
        ts, blob = _CACHE[ck]
        if now - ts < _CACHE_TTL_SEC:
            return dict(blob)

    url = "https://newsapi.org/v2/everything"
    params = {
        "q": q,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": _MAX_HEADLINES,
        "apiKey": key,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(18.0)) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError):
        base["ok"] = False
        base["error"] = "fetch_failed"
        _CACHE[ck] = (now, dict(base))
        return base

    if not isinstance(data, dict) or data.get("status") != "ok":
        base["ok"] = False
        base["error"] = "api_status"
        _CACHE[ck] = (now, dict(base))
        return base

    articles = data.get("articles") or []
    headlines: list[dict[str, str]] = []
    for a in articles[:_MAX_HEADLINES]:
        if not isinstance(a, dict):
            continue
        t = str(a.get("title") or "").strip()
        if not t:
            continue
        src = a.get("source") if isinstance(a.get("source"), dict) else {}
        name = str((src or {}).get("name") or "").strip()
        headlines.append({"title": t[:400], "source": name[:120]})

    out = {
        "configured": True,
        "ok": True,
        "query": q,
        "headlines": headlines,
    }
    _CACHE[ck] = (now, dict(out))
    return out


def headlines_for_claude(news_block: dict[str, Any]) -> list[dict[str, str]]:
    if not news_block.get("ok"):
        return []
    h = news_block.get("headlines")
    if not isinstance(h, list):
        return []
    return [x for x in h if isinstance(x, dict)]


_DAILY_NEWS_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_DAILY_CACHE_TTL_SEC = 300.0
_DAILY_MAX_HEADLINES = 5
_DAILY_LOOKBACK_DAYS = 7


def _format_published_date(published_at: str) -> str:
    s = (published_at or "").strip()
    if not s:
        return "unknown date"
    try:
        if s.endswith("Z"):
            s = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return s[:10] if len(s) >= 10 else s


async def fetch_news_for_daily_pick(title: str) -> dict[str, Any]:
    """
    Top 5 articles from the last 7 days for the daily pick prompt.
    `prompt_block` is one line per headline: [Source, Date]: Title
    or the sentinel string if nothing was found.
    """
    key = os.getenv("NEWS_API_KEY", "").strip()
    q = build_news_query(title)
    base: dict[str, Any] = {
        "configured": bool(key),
        "query": q,
        "headlines": [],
        "prompt_block": "No recent headlines found for this topic.",
        "ok": False,
    }
    if not key or not q:
        return base

    now_m = time.monotonic()
    ck = f"daily7|{q.casefold()}"
    if ck in _DAILY_NEWS_CACHE:
        ts, blob = _DAILY_NEWS_CACHE[ck]
        if now_m - ts < _DAILY_CACHE_TTL_SEC:
            return dict(blob)

    now = datetime.now(timezone.utc)
    from_dt = now - timedelta(days=_DAILY_LOOKBACK_DAYS)
    params = {
        "q": q,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": _DAILY_MAX_HEADLINES,
        "apiKey": key,
        "from": from_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        "to": now.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    url = "https://newsapi.org/v2/everything"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(22.0)) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError):
        base["ok"] = False
        base["error"] = "fetch_failed"
        _DAILY_NEWS_CACHE[ck] = (now_m, dict(base))
        return base

    if not isinstance(data, dict) or data.get("status") != "ok":
        base["ok"] = False
        base["error"] = "api_status"
        _DAILY_NEWS_CACHE[ck] = (now_m, dict(base))
        return base

    articles = data.get("articles") or []
    headlines: list[dict[str, str]] = []
    lines: list[str] = []
    for a in articles[:_DAILY_MAX_HEADLINES]:
        if not isinstance(a, dict):
            continue
        t = str(a.get("title") or "").strip()
        if not t:
            continue
        src_o = a.get("source") if isinstance(a.get("source"), dict) else {}
        name = str((src_o or {}).get("name") or "").strip() or "Unknown"
        pub = _format_published_date(str(a.get("publishedAt") or ""))
        headlines.append(
            {
                "title": t[:500],
                "source": name[:160],
                "published_at": pub,
            }
        )
        lines.append(f"[{name}, {pub}]: {t[:500]}")

    prompt_block = "No recent headlines found for this topic."
    if lines:
        prompt_block = "\n".join(lines)

    out = {
        "configured": True,
        "ok": True,
        "query": q,
        "headlines": headlines,
        "prompt_block": prompt_block,
    }
    _DAILY_NEWS_CACHE[ck] = (now_m, dict(out))
    return out


_NEWS_STOPWORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "as",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "shall",
        "can",
        "this",
        "that",
        "these",
        "those",
        "with",
        "without",
        "by",
        "from",
        "into",
        "about",
        "than",
        "then",
        "so",
        "if",
        "not",
        "no",
        "yes",
        "how",
        "what",
        "when",
        "where",
        "who",
        "which",
        "why",
    }
)


def derive_three_news_queries(title: str) -> list[str]:
    """
    Build three targeted queries from core subject/action words.
    - Removes resolution-date noise and framing words ("will", "before", "by").
    - Avoids including explicit deadline dates that pollute NewsAPI matching.
    """
    raw_words = re.findall(r"[A-Za-z0-9]+", title or "")
    stop = set(_NEWS_STOPWORDS) | {
        "before",
        "after",
        "by",
        "prior",
        "deadline",
        "date",
        "will",
    }
    filtered: list[str] = []
    for w in raw_words:
        wl = w.lower()
        if wl in stop:
            continue
        # Drop date-ish and year/day tokens to avoid deadline-noise in search.
        if wl.isdigit():
            continue
        if re.match(r"^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$", wl):
            continue
        if re.match(r"^\d{4}$", wl):
            continue
        filtered.append(w)

    if not filtered:
        t = (title or "").strip()
        base = t[:220] if t else "news"
        return [base, base, base]

    # Core entities and actions.
    countries = [w for w in filtered if w.lower() in {"china", "russia", "iran", "israel", "ukraine", "us", "u", "usa"}]
    has_trump = any(w.lower() == "trump" for w in filtered)
    has_visit = any(w.lower().startswith("visit") for w in filtered)
    has_trade = any(w.lower().startswith("trade") or w.lower() == "tariff" for w in filtered)

    base_core = " ".join(filtered[:6]).strip()
    if has_trump and "china" in [c.lower() for c in countries] and has_visit:
        q1 = "Trump China visit 2026"
        q2 = "US China diplomatic relations April 2026"
        q3 = "Trump foreign policy China trade war" if has_trade else "Trump foreign policy China"
    else:
        subject = " ".join(filtered[:4]).strip()
        q1 = f"{subject} 2026".strip()
        q2 = f"{subject} diplomatic relations".strip()
        q3 = f"{base_core} policy outlook".strip()

    out: list[str] = []
    seen: set[str] = set()
    for q in (q1, q2, q3):
        qn = re.sub(r"\s+", " ", q).strip()[:220]
        k = qn.casefold()
        if qn and k not in seen:
            seen.add(k)
            out.append(qn)
    while len(out) < 3:
        out.append(out[0] if out else base_core[:220])
    return out[:3]


def daily_pick_query_words(title: str) -> set[str]:
    """Token set used to score NewsAPI and RSS headlines for the daily pick."""
    queries = derive_three_news_queries(title)
    query_word_union: set[str] = set()
    for q in queries:
        for w in re.findall(r"[A-Za-z0-9]+", q):
            wl = w.lower()
            if len(wl) <= 2 or wl in _NEWS_STOPWORDS:
                continue
            query_word_union.add(wl)
    return query_word_union


def _headline_relevance_score(title: str, query_words: set[str]) -> int:
    twords = {w.lower() for w in re.findall(r"[A-Za-z0-9]+", title or "")}
    if not twords or not query_words:
        return 0
    return sum(1 for w in query_words if w in twords)


async def fetch_news_triple_for_daily_pick(title: str) -> dict[str, Any]:
    """
    Three NewsAPI `everything` queries (7d window), dedupe by title, rank for merge with RSS (up to 12 candidates).
    """
    key = os.getenv("NEWS_API_KEY", "").strip()
    queries = derive_three_news_queries(title)
    base: dict[str, Any] = {
        "configured": bool(key),
        "queries": queries,
        "headlines": [],
        "prompt_block": "No recent headlines found for this topic.",
        "ok": False,
        "api_ok_count": 0,
    }
    if not key:
        return base

    now = datetime.now(timezone.utc)
    from_dt = now - timedelta(days=_DAILY_LOOKBACK_DAYS)
    from_s = from_dt.strftime("%Y-%m-%dT%H:%M:%S")
    to_s = now.strftime("%Y-%m-%dT%H:%M:%S")
    url = "https://newsapi.org/v2/everything"

    merged: dict[str, dict[str, str]] = {}
    api_ok = 0
    query_word_union = daily_pick_query_words(title)

    async with httpx.AsyncClient(timeout=httpx.Timeout(22.0)) as client:
        for q in queries:
            params = {
                "q": q,
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": 10,
                "apiKey": key,
                "from": from_s,
                "to": to_s,
            }
            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
            except (httpx.HTTPError, ValueError):
                continue
            if not isinstance(data, dict) or data.get("status") != "ok":
                continue
            api_ok += 1
            for a in data.get("articles") or []:
                if not isinstance(a, dict):
                    continue
                t = str(a.get("title") or "").strip()
                if not t:
                    continue
                rel_score = _headline_relevance_score(t, query_word_union)
                if rel_score <= 0:
                    # Drop unrelated headlines (NewsAPI often returns topic-adjacent noise).
                    continue
                tl = t.casefold()
                if tl in merged:
                    continue
                src_o = a.get("source") if isinstance(a.get("source"), dict) else {}
                name = str((src_o or {}).get("name") or "").strip() or "Unknown"
                pub = _format_published_date(str(a.get("publishedAt") or ""))
                merged[tl] = {
                    "title": t[:500],
                    "source": name[:160],
                    "published_at": pub,
                    "published_raw": str(a.get("publishedAt") or ""),
                    "relevance_score": str(rel_score),
                }

    ranked = sorted(
        merged.values(),
        key=lambda x: (int(x.get("relevance_score") or "0"), x.get("published_raw") or ""),
        reverse=True,
    )
    headlines = [{k: v for k, v in h.items() if k not in ("published_raw", "relevance_score")} for h in ranked[:12]]
    lines: list[str] = []
    for h in headlines:
        lines.append(f"[{h['source']}, {h['published_at']}]: {h['title']}")

    prompt_block = "No recent headlines found for this topic."
    if lines:
        prompt_block = "\n".join(lines)

    out = {
        "configured": True,
        "queries": queries,
        "headlines": headlines,
        "prompt_block": prompt_block,
        "ok": bool(lines),
        "api_ok_count": api_ok,
    }
    return out


_EXPERT_DOMAIN_HINTS = (
    "metaculus.com",
    "manifold.markets",
    "polymarket.com",
)


def _first_probability_in_text(text: str) -> float | None:
    """Parse a human percentage like 38% or 38 percent as probability in [0, 1]."""
    if not text:
        return None
    m = re.search(r"(?P<n>\d{1,3}(?:\.\d+)?)\s*(?:%|percent)\b", text, re.I)
    if not m:
        return None
    try:
        v = float(m.group("n"))
    except (TypeError, ValueError):
        return None
    if not (0.0 <= v <= 100.0):
        return None
    return v / 100.0


async def fetch_expert_forecast_block(title: str) -> dict[str, Any]:
    """
    NewsAPI everything with forecasting-site domains; extract a % from headline/description if present.
    """
    key = os.getenv("NEWS_API_KEY", "").strip()
    q = build_news_query(title) or (title or "")[:200]
    base: dict[str, Any] = {
        "configured": bool(key),
        "query": q,
        "ok": False,
        "found": False,
        "prompt_line": "Expert / crowd forecasts: No clear Metaculus / Manifold / Polymarket headline estimate found in recent search results.",
        "source_domain": None,
        "headline": None,
        "implied_probability": None,
    }
    if not key or not q:
        return base

    now = datetime.now(timezone.utc)
    from_dt = now - timedelta(days=30)
    params = {
        "q": q,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": 15,
        "apiKey": key,
        "from": from_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        "to": now.strftime("%Y-%m-%dT%H:%M:%S"),
        "domains": ",".join(_EXPERT_DOMAIN_HINTS),
    }
    url = "https://newsapi.org/v2/everything"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError):
        return base

    if not isinstance(data, dict) or data.get("status") != "ok":
        return base

    base["ok"] = True
    articles = data.get("articles") or []
    for a in articles:
        if not isinstance(a, dict):
            continue
        t = str(a.get("title") or "").strip()
        desc = str(a.get("description") or "").strip()
        url_a = str(a.get("url") or "").lower()
        blob = f"{t}. {desc}"
        prob = _first_probability_in_text(blob)
        if prob is None:
            continue
        dom = ""
        for d in _EXPERT_DOMAIN_HINTS:
            if d in url_a:
                dom = d.split(".")[0].title()
                break
        if not dom:
            dom = "forecast site"
        pct = round(float(prob) * 100.0, 1)
        when = _format_published_date(str(a.get("publishedAt") or ""))
        line = f"Expert / crowd forecasts: {dom} headline cites about {pct:.1f}% implied chance (as of {when}): {t[:240]}"
        base["found"] = True
        base["prompt_line"] = line
        base["source_domain"] = dom
        base["headline"] = t[:500]
        base["implied_probability"] = float(prob)
        break

    return base
