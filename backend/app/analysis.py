"""
Stage 12A — Market analysis (probability + confidence) without requiring an LLM.

Baseline: implied YES probability = mid of bid/ask (same information as the market).
Confidence: derived from spread tightness and volume (liquidity quality), not “AI certainty.”
"""

from __future__ import annotations

from typing import Any

from app.scanner import summarize_market


def _confidence_label(conf: float) -> str:
    if conf >= 0.65:
        return "high"
    if conf >= 0.4:
        return "medium"
    return "low"


def build_market_analysis(
    market: dict[str, Any],
    *,
    title_override: str | None = None,
) -> dict[str, Any]:
    """
    Deterministic analysis from a Kalshi market REST object.

    `model_yes_probability` matches `implied_yes_probability` until a news/LLM layer exists.
    """
    s = summarize_market(market)
    implied = float(s.get("mid_prob") or 0.0)
    implied = max(0.0, min(1.0, implied))

    spread = float(s.get("spread") or 1.0)
    vol = float(s.get("volume") or 0.0)
    yes_bid = float(s.get("yes_bid") or 0.0)
    yes_ask = float(s.get("yes_ask") or 0.0)

    # Liquidity-based confidence: tighter spread + more volume → more trust in the mid as a snapshot.
    spread_factor = max(0.0, 1.0 - min(spread / 0.35, 1.0))
    vol_factor = min(vol / 150_000.0, 1.0)
    confidence = 0.12 + 0.48 * spread_factor + 0.35 * vol_factor
    if spread >= 0.95 or (yes_bid <= 0.0 and yes_ask <= 0.0):
        confidence = min(confidence, 0.28)
    confidence = round(min(0.92, max(0.08, confidence)), 3)

    title = (title_override or market.get("title") or market.get("subtitle") or "").strip()
    ticker = market.get("ticker")

    return {
        "ticker": ticker,
        "title": title,
        "implied_yes_probability": round(implied, 4),
        "model_yes_probability": round(implied, 4),
        "confidence": confidence,
        "confidence_label": _confidence_label(confidence),
        "edge_vs_market_yes": 0.0,
        "source": "market_mid",
        "rationale": (
            f"Baseline uses the order-book mid (~{implied * 100:.1f}% YES). "
            f"Spread is {spread:.2f} and 24h volume is about {vol:,.0f} contracts. "
            "This is not a news or fundamentals forecast—only a snapshot of the market."
        ),
        "factors": {
            "yes_bid": yes_bid,
            "yes_ask": yes_ask,
            "spread": round(spread, 4),
            "volume": vol,
            "mid_prob": round(implied, 4),
        },
    }
