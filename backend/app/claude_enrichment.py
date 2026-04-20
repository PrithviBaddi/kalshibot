"""
Stage 12B — Optional Claude (Anthropic) enrichment for /api/v1/analysis/market.

If ANTHROPIC_API_KEY is set, asks for a JSON adjustment to baseline probabilities.
On any failure, returns None and the caller keeps the deterministic baseline.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Literal

import httpx


def _append_news_headlines(user: str, news_headlines: list[dict[str, str]] | None) -> str:
    if not news_headlines:
        return user
    lines: list[str] = []
    for h in news_headlines[:8]:
        t = str(h.get("title") or "").strip()
        src = str(h.get("source") or "").strip()
        if not t:
            continue
        if src:
            lines.append(f"- [{src}] {t[:320]}")
        else:
            lines.append(f"- {t[:320]}")
    if lines:
        user += (
            "\n\nRecent public news headlines (may be incomplete or noisy; weigh carefully):\n"
            + "\n".join(lines)
        )
    return user


def _anthropic_model_for_mode(mode: Literal["market_analysis", "daily_pick"]) -> str:
    """
    Daily pick uses `app.daily_pick_claude` (Sonnet 4.6 by default). This path is market analysis only.
    """
    if mode == "daily_pick":
        # Kept for typing compatibility; daily pick should call enrich_daily_pick_with_claude instead.
        return os.getenv("ANTHROPIC_MODEL_DAILY_PICK", "").strip() or "claude-sonnet-4-6"
    return os.getenv("ANTHROPIC_MODEL", "").strip() or "claude-haiku-4-5"


async def _anthropic_messages_json(
    *,
    system: str,
    user: str,
    max_tokens: int,
    model: str,
) -> str | None:
    key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return None
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError, json.JSONDecodeError):
        return None

    text = ""
    try:
        blocks = data.get("content") or []
        for b in blocks:
            if isinstance(b, dict) and b.get("type") == "text":
                text += b.get("text") or ""
    except (TypeError, KeyError):
        return None
    return text.strip() or None


async def enrich_analysis_with_claude(
    baseline: dict[str, Any],
    *,
    market: dict[str, Any],
    news_headlines: list[dict[str, str]] | None = None,
    mode: Literal["market_analysis", "daily_pick"] = "market_analysis",
) -> dict[str, Any] | None:
    key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return None

    if mode == "daily_pick":
        # Daily pick uses app.daily_pick_claude.enrich_daily_pick_with_claude
        return None

    title = str(market.get("title") or market.get("subtitle") or baseline.get("title") or "")
    ticker = str(market.get("ticker") or baseline.get("ticker") or "")
    implied = float(baseline.get("implied_yes_probability") or 0.0)

    system = (
        "You assist a prediction-market trader. Respond with a single JSON object only, no markdown. "
        "Keys: model_yes_probability (0-1 float, your best estimate for P(YES)), "
        "confidence (0-1 float, your confidence in that estimate given public info only), "
        "rationale (short string, <= 400 chars). "
        "Do not claim insider knowledge. If uncertain, stay near the market mid."
    )
    user = (
        f"Market ticker: {ticker}\n"
        f"Question/title: {title}\n"
        f"Current order-book implied P(YES) (mid): {implied:.4f}\n"
        "Adjust if generic reasoning suggests the market mid is mispriced; otherwise stay close to it."
    )
    user = _append_news_headlines(user, news_headlines)
    max_tokens = 400
    source_tag = "claude_haiku_plus_market_mid"

    model_id = _anthropic_model_for_mode("market_analysis")
    text = await _anthropic_messages_json(
        system=system, user=user, max_tokens=max_tokens, model=model_id
    )
    if not text:
        return None

    obj = _extract_json_object(text)
    if not obj:
        return None

    try:
        my = float(obj.get("model_yes_probability", implied))
        conf = float(obj.get("confidence", baseline.get("confidence") or 0.5))
        rationale = str(obj.get("rationale", ""))[:2000]
    except (TypeError, ValueError):
        return None

    my = max(0.02, min(0.98, my))
    conf = max(0.05, min(0.95, conf))

    out = dict(baseline)
    out["model_yes_probability"] = round(my, 4)
    out["confidence"] = round(conf, 3)
    out["confidence_label"] = _label(conf)
    out["edge_vs_market_yes"] = round(my - float(baseline.get("implied_yes_probability") or 0.0), 4)
    out["source"] = source_tag
    if rationale:
        out["rationale"] = rationale
    out["claude"] = {"raw_excerpt": text[:400], "model": model_id}
    return out


def _label(conf: float) -> str:
    if conf >= 0.65:
        return "high"
    if conf >= 0.4:
        return "medium"
    return "low"


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = text.strip()
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
