"""
Daily pick — Claude analyst prompt, JSON parsing, and server-side PASS rules.

Model for this path: claude-sonnet-4-6 (override with ANTHROPIC_MODEL_DAILY_PICK only).
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.claude_enrichment import _anthropic_messages_json, _extract_json_object

logger = logging.getLogger(__name__)

DAILY_PICK_MODEL_DEFAULT = "claude-sonnet-4-6"

DAILY_PICK_SYSTEM_PROMPT = """You are an analyst helping readers understand one Kalshi prediction market for a daily email–style pick.

You only use public information provided in the briefing: the market text, the Kalshi-implied chance of YES, the 7-day Kalshi price trend summary, the multi-source news scan, any expert/crowd forecast lines (Metaculus / Manifold / Polymarket headline scan), and our notes on similar past picks. You do not have insider information.

You must explicitly use all four context sources when they contain substantive information:
1) Kalshi 7-day price trend — cite whether YES pricing moved, held flat, or tilted toward NO.
2) News — cite at least one headline (paraphrase is fine) when headlines exist; if the news block says none were found, say so.
3) Expert / crowd forecasts — if a forecast probability is quoted, compare it to Kalshi; if the briefing says none was found, acknowledge that gap.
4) Historical context — if we list similar past picks and whether we were right or wrong, weigh that carefully; if none are listed, say we have no close internal precedent.

If an expert or crowd forecast is available and is **meaningfully different** from the Kalshi-implied YES (roughly 12+ percentage points apart), your "reasoning" must briefly explain plausible reasons for that disagreement (information, timing, selection, or trader bias) in plain English.

Your job:
1. Restate the Kalshi-implied probability of YES clearly (use the number we give you).
2. Give your own estimate of the real-world probability that YES happens, using the briefing when relevant and general knowledge when helpful.
3. In plain English, explain the gap between Kalshi’s view and yours (why they might differ, or why they align).
4. Give a confidence score from 1 to 100 based on how much solid, relevant evidence you have—not trading confidence, not “gut feel.” Low scores when context is missing, irrelevant, or contradictory.
5. Compute edge = (your estimated P(YES)) minus (Kalshi-implied P(YES)), using probabilities as decimals between 0 and 1 (e.g. market 0.40 and you 0.55 means edge 0.15, i.e. 15 percentage points).

Output rules:
- Respond with a single JSON object only. No markdown, no code fences, no text before or after the JSON.
- Required keys and types:
  - "model_yes_probability": number between 0.02 and 0.98 (your P(YES))
  - "confidence_score": integer from 1 to 100
  - "reasoning": string, maximum 3 short sentences, plain English, no jargon (no "spread", "liquidity", "order book", "edge" as a finance term—plain words only)
  - "recommended_action": exactly one of "BUY_YES", "BUY_NO", "PASS"
  - "edge": number, your model_yes_probability minus Kalshi implied YES (same units as probabilities, typically between -1 and 1)

Recommendation rule (we also enforce this in software):
- If the absolute gap is smaller than 0.10 (10 percentage points), set recommended_action to "PASS" — tiny edge is never worth acting on.
- If |edge| ≥ 0.40 and confidence_score ≥ 40, a BUY_YES or BUY_NO may stand (large disagreement with moderate+ confidence).
- If |edge| ≥ 0.20 and confidence_score ≥ 50, a BUY_YES or BUY_NO may stand.
- If 0.10 ≤ |edge| < 0.20, we still require confidence_score ≥ 60 to act; otherwise PASS.
- Otherwise set recommended_action to "PASS".

This is educational context only, not financial advice."""


def build_daily_pick_user_prompt(
    *,
    ticker: str,
    title: str,
    implied_decimal: float,
    structured_briefing: str,
) -> str:
    pct = implied_decimal * 100.0
    return f"""Kalshi contract ticker: {ticker}

Question (exact contract text):
{title}

Kalshi-implied probability of YES (from mid / stated mid): {pct:.1f}%  (decimal {implied_decimal:.6f})

{structured_briefing}

Instructions:
1. State the Kalshi-implied probability of YES in one short phrase in your JSON reasoning (first sentence).
2. Weave in the price trend, news, expert/crowd lines, and historical context where applicable (per system rules).
3. Give your real-world P(YES) as model_yes_probability.
4. Explain the gap vs Kalshi in plain English in "reasoning" (2–3 sentences max). If an expert forecast disagrees strongly with Kalshi, address why.
5. Set confidence_score 1–100 from evidence quality across all sources.
6. Set edge = model_yes_probability − {implied_decimal:.6f} (you may recompute; we will verify in code).
7. Set recommended_action to BUY_YES, BUY_NO, or PASS using the server PASS rules (tiny |edge| → PASS; large |edge| allows lower confidence — see system prompt).

Return only the JSON object."""


def _normalize_recommended_action(raw: str) -> str:
    s = (raw or "").upper().strip().replace(" ", "_").replace("-", "_")
    if s in ("BUY_YES", "BUY_NO", "PASS"):
        return s
    if "PASS" in s:
        return "PASS"
    if "YES" in s and "BUY" in s:
        return "BUY_YES"
    if "NO" in s and "BUY" in s:
        return "BUY_NO"
    return "PASS"


def apply_daily_pick_pass_rules(parsed: dict[str, Any]) -> dict[str, Any]:
    """
    Final authority for actionable recommendations:
    - Always PASS if |edge| < 0.10.
    - If |edge| >= 0.40: allow BUY_YES/BUY_NO when confidence_score >= 40.
    - Elif |edge| >= 0.20: allow when confidence_score >= 50.
    - Elif |edge| >= 0.10: allow only when confidence_score >= 60 (marginal edge).
    """
    edge = float(parsed.get("edge", 0.0))
    cs = int(parsed.get("confidence_score", 0))
    ra = _normalize_recommended_action(str(parsed.get("recommended_action", "PASS")))
    ae = abs(edge)

    if ae <= 0.09:
        ra = "PASS"
    elif ae >= 0.40:
        if cs < 40:
            ra = "PASS"
    elif ae >= 0.20:
        if cs < 50:
            ra = "PASS"
    else:
        # 0.10 <= ae < 0.20
        if cs < 60:
            ra = "PASS"

    out = dict(parsed)
    out["edge"] = round(edge, 6)
    out["confidence_score"] = max(1, min(100, cs))
    out["recommended_action"] = ra
    return out


def parse_daily_pick_claude_json(obj: dict[str, Any], *, implied_decimal: float) -> dict[str, Any] | None:
    """Validate and normalize Claude output; recompute edge = model_yes - implied."""
    try:
        my = float(obj.get("model_yes_probability", implied_decimal))
    except (TypeError, ValueError):
        return None
    my = max(0.02, min(0.98, my))

    cs_raw = obj.get("confidence_score", 60)
    try:
        cs = int(float(cs_raw))
    except (TypeError, ValueError):
        cs = 60
    if 0 < cs <= 1:
        cs = int(cs * 100)
    cs = max(1, min(100, cs))

    reasoning = str(obj.get("reasoning", ""))[:2000].strip()
    if not reasoning:
        return None

    edge = my - float(implied_decimal)
    if "edge" in obj and obj.get("edge") is not None:
        try:
            edge = float(obj.get("edge"))
        except (TypeError, ValueError):
            edge = my - float(implied_decimal)

    ra = _normalize_recommended_action(str(obj.get("recommended_action", "PASS")))

    return {
        "model_yes_probability": round(my, 4),
        "confidence_score": cs,
        "reasoning": reasoning,
        "recommended_action": ra,
        "edge": round(edge, 6),
    }


def _confidence_label_from_score(score: int) -> str:
    if score >= 65:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


async def enrich_daily_pick_with_claude(
    baseline: dict[str, Any],
    market: dict[str, Any],
    *,
    structured_briefing: str,
) -> tuple[dict[str, Any] | None, str | None]:
    """
    Run daily-pick analyst prompt; returns merged analysis dict and raw Claude text.
    Uses claude-sonnet-4-6 unless ANTHROPIC_MODEL_DAILY_PICK is set (never Haiku by default).
    """
    if not os.getenv("ANTHROPIC_API_KEY", "").strip():
        logger.warning("Daily pick Claude skipped: ANTHROPIC_API_KEY is not configured")
        return None, None

    model_id = os.getenv("ANTHROPIC_MODEL_DAILY_PICK", "").strip() or DAILY_PICK_MODEL_DEFAULT
    title = str(market.get("title") or market.get("subtitle") or baseline.get("title") or "")
    ticker = str(market.get("ticker") or baseline.get("ticker") or "")
    implied = float(baseline.get("implied_yes_probability") or 0.0)

    user = build_daily_pick_user_prompt(
        ticker=ticker,
        title=title,
        implied_decimal=implied,
        structured_briefing=structured_briefing,
    )
    try:
        text = await _anthropic_messages_json(
            system=DAILY_PICK_SYSTEM_PROMPT,
            user=user,
            max_tokens=900,
            model=model_id,
        )
    except Exception as e:
        logger.warning("Daily pick Claude call failed unexpectedly: %s", e)
        return None, None
    if not text:
        logger.warning("Daily pick Claude returned no content; falling back to baseline")
        return None, None

    obj = _extract_json_object(text)
    if not obj:
        return None, text

    parsed = parse_daily_pick_claude_json(obj, implied_decimal=implied)
    if not parsed:
        return None, text

    parsed = apply_daily_pick_pass_rules(parsed)
    my = parsed["model_yes_probability"]
    cs = parsed["confidence_score"]
    edge = parsed["edge"]
    reasoning = parsed["reasoning"]
    ra = parsed["recommended_action"]

    out = dict(baseline)
    out["model_yes_probability"] = my
    out["implied_yes_probability"] = round(implied, 4)
    out["confidence_score"] = cs
    out["confidence"] = round(cs / 100.0, 4)
    out["confidence_label"] = _confidence_label_from_score(cs)
    out["edge_vs_market_yes"] = edge
    out["edge"] = edge
    out["rationale"] = reasoning
    out["reasoning"] = reasoning
    out["recommended_action"] = ra
    out["source"] = "claude_daily_pick_analyst"
    out["claude"] = {
        "model": model_id,
        "raw_response": text[:12000],
    }
    return out, text
