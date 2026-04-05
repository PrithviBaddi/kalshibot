"""
Stage 12C — Optional NewsAPI.org headlines for /api/v1/analysis/market.

If NEWS_API_KEY is set, fetches a few recent articles matching a query derived from the market title.
Headlines are attached to the analysis payload and passed to Claude when enrichment runs.
"""

from __future__ import annotations

import os
import re
import time
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
