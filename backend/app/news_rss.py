"""
RSS headline fetch for daily pick — urllib + ElementTree only (no extra deps).

Feeds are scored with the same token overlap rule as NewsAPI headlines in news_context.
"""

from __future__ import annotations

import logging
import re
import ssl
import urllib.request
from email.utils import parsedate_to_datetime
from typing import Any
from xml.etree import ElementTree as ET

from app.news_context import _headline_relevance_score, daily_pick_query_words

logger = logging.getLogger(__name__)

_RSS_FEEDS: tuple[tuple[str, str], ...] = (
    ("https://feeds.reuters.com/reuters/politicsNews", "Reuters"),
    ("https://feeds.reuters.com/reuters/businessNews", "Reuters"),
    ("https://feeds.apnews.com/rss/apf-politics", "AP News"),
    ("https://www.politico.com/rss/politicopicks.xml", "Politico"),
)

_USER_AGENT = "KalshiBot/1.0 (+https://kalshibot.local; RSS reader)"
_FETCH_TIMEOUT_SEC = 22
_MAX_PER_FEED = 20
_TOP_GLOBAL = 5


def _strip_tag(tag: str) -> str:
    if not tag:
        return ""
    return tag.split("}")[-1]


def _text(el: ET.Element | None) -> str:
    if el is None:
        return ""
    t = (el.text or "").strip()
    if el.tail:
        t = f"{t} {el.tail}".strip()
    return t


def _parse_pub_date(raw: str) -> tuple[str, str]:
    """Returns (YYYY-MM-DD display, raw for sorting)."""
    s = (raw or "").strip()
    if not s:
        return ("unknown date", "")
    try:
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            from datetime import timezone

            dt = dt.replace(tzinfo=timezone.utc)
        return (dt.strftime("%Y-%m-%d"), s)
    except (TypeError, ValueError):
        return (s[:10] if len(s) >= 10 else "unknown date", s)


def _parse_rss_items(xml_bytes: bytes, default_source: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        logger.warning("RSS parse error for source=%s: %s", default_source, e)
        return out

    root_tag = _strip_tag(root.tag).lower()
    if root_tag == "rss":
        channel = None
        for ch in root:
            if _strip_tag(ch.tag).lower() == "channel":
                channel = ch
                break
        if channel is None:
            return out
        ch_title = default_source
        for ch in channel:
            if _strip_tag(ch.tag).lower() == "title":
                ch_title = _text(ch) or default_source
                break
        n_item = 0
        for item in channel:
            if _strip_tag(item.tag).lower() != "item":
                continue
            if n_item >= _MAX_PER_FEED:
                break
            n_item += 1
            t = ""
            pub_raw = ""
            src = ch_title or default_source
            for el in item:
                lt = _strip_tag(el.tag).lower()
                if lt == "title":
                    t = _text(el)
                elif lt == "pubdate":
                    pub_raw = _text(el)
                elif lt == "creator" or el.tag.endswith("}creator"):
                    if _text(el):
                        src = _text(el)[:160]
            if not t:
                continue
            disp, raw_sort = _parse_pub_date(pub_raw)
            out.append(
                {
                    "title": t[:600],
                    "source": (src or default_source)[:160],
                    "published_at": disp,
                    "published_raw": raw_sort or pub_raw,
                }
            )
        return out

    if root_tag == "feed":
        ch_title = default_source
        for child in root:
            if _strip_tag(child.tag).lower() == "title":
                ch_title = _text(child) or default_source
                break
        n_entry = 0
        for entry in root:
            if _strip_tag(entry.tag).lower() != "entry":
                continue
            if n_entry >= _MAX_PER_FEED:
                break
            n_entry += 1
            t = ""
            pub_raw = ""
            for ch in entry:
                lt = _strip_tag(ch.tag).lower()
                if lt == "title":
                    t = _text(ch)
                elif lt in ("updated", "published", "date"):
                    if not pub_raw:
                        pub_raw = _text(ch)
            if not t:
                continue
            disp, raw_sort = _parse_pub_date(pub_raw)
            out.append(
                {
                    "title": t[:600],
                    "source": (ch_title or default_source)[:160],
                    "published_at": disp,
                    "published_raw": raw_sort or pub_raw,
                }
            )
        if out:
            return out

    logger.warning("RSS unknown root tag=%s source=%s", root_tag, default_source)
    return out


def _fetch_url(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=_FETCH_TIMEOUT_SEC, context=ctx) as resp:
        return resp.read()


def fetch_rss_for_daily_pick(title: str) -> dict[str, Any]:
    """
    Fetch configured RSS feeds, score headlines vs daily pick query words, return top 5 overall.
    Synchronous; call from asyncio.to_thread in async code paths.
    """
    qw = daily_pick_query_words(title)
    if not qw:
        return {
            "ok": False,
            "headlines": [],
            "prompt_block": "",
            "error": "empty_query_words",
            "feeds_ok": 0,
        }

    scored: list[dict[str, Any]] = []
    feeds_ok = 0
    for url, default_src in _RSS_FEEDS:
        try:
            raw = _fetch_url(url)
        except Exception as e:
            logger.warning("RSS fetch failed url=%s err=%s", url, e)
            continue
        feeds_ok += 1
        items = _parse_rss_items(raw, default_src)
        for it in items:
            t = it.get("title") or ""
            sc = _headline_relevance_score(t, qw)
            if sc <= 0:
                continue
            scored.append({**it, "relevance_score": sc})

    scored.sort(
        key=lambda x: (int(x.get("relevance_score") or 0), str(x.get("published_raw") or "")),
        reverse=True,
    )

    seen: set[str] = set()
    top: list[dict[str, str]] = []
    for row in scored:
        tl = str(row.get("title") or "").casefold()
        if not tl or tl in seen:
            continue
        seen.add(tl)
        top.append(
            {
                "title": str(row.get("title") or "")[:500],
                "source": str(row.get("source") or "")[:160],
                "published_at": str(row.get("published_at") or ""),
            }
        )
        if len(top) >= _TOP_GLOBAL:
            break

    lines = [f"[{h['source']}, {h['published_at']}]: {h['title']}" for h in top]
    prompt_block = "\n".join(lines) if lines else ""

    return {
        "ok": bool(top),
        "headlines": top,
        "prompt_block": prompt_block,
        "feeds_ok": feeds_ok,
    }
