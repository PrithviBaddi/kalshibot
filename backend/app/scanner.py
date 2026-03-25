"""Lightweight market scanner for Stage 4."""

from __future__ import annotations

import re
from typing import Any

SPORTS_TICKER_HINTS = (
    "KXNBA",
    "KXNHL",
    "KXNFL",
    "KXMLB",
    "KXNCAA",
    "KXATP",
    "KXWTA",
    "KXUFC",
    "KXPGA",
    "KXEPL",
    "KXCS2",
    "KXSERIEA",
    "KXSUPERLIG",
    "KXMARMAD",
)

SPORTS_WORD_HINTS = (
    "nba",
    "nfl",
    "nhl",
    "mlb",
    "ufc",
    "atp",
    "wta",
    "golf",
    "soccer",
    "baseball",
    "basketball",
    "tennis",
    "hockey",
    "march madness",
    "world cup",
    "playoff",
)


def _f(value: Any) -> float:
    """Best-effort float parse for Kalshi numeric strings."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def summarize_market(m: dict[str, Any]) -> dict[str, Any]:
    yes_bid = _f(m.get("yes_bid_dollars"))
    yes_ask = _f(m.get("yes_ask_dollars"))
    spread = max(0.0, yes_ask - yes_bid) if yes_ask and yes_bid else 1.0
    mid = (yes_ask + yes_bid) / 2 if yes_ask and yes_bid else _f(m.get("price_dollars"))
    volume = _f(m.get("volume_fp"))
    oi = _f(m.get("open_interest_fp"))

    # Higher score means tighter market + higher activity.
    score = round((1.0 - min(spread, 1.0)) * 60 + min(volume / 100000.0, 1.0) * 20 + min(oi / 100000.0, 1.0) * 20, 2)

    return {
        "ticker": m.get("ticker"),
        "title": m.get("title"),
        "close_time": m.get("close_time"),
        "yes_bid": yes_bid,
        "yes_ask": yes_ask,
        "mid_prob": round(mid, 4),
        "spread": round(spread, 4),
        "volume": volume,
        "open_interest": oi,
        "score": score,
    }


def is_sports_market(m: dict[str, Any]) -> bool:
    ticker = str(m.get("ticker") or "").upper()
    title = str(m.get("title") or "").lower()
    event_ticker = str(m.get("event_ticker") or "").upper()
    if any(h in ticker for h in SPORTS_TICKER_HINTS):
        return True
    if any(h in event_ticker for h in SPORTS_TICKER_HINTS):
        return True
    if any(re.search(rf"\b{re.escape(w)}\b", title) for w in SPORTS_WORD_HINTS):
        return True
    return False


def top_opportunities(
    markets: list[dict[str, Any]],
    *,
    top_n: int,
    min_volume: float,
    max_spread: float,
    include_sports: bool,
) -> list[dict[str, Any]]:
    rows = []
    for m in markets:
        if not include_sports and is_sports_market(m):
            continue
        s = summarize_market(m)
        if s["volume"] < min_volume:
            continue
        if s["spread"] > max_spread:
            continue
        rows.append(s)
    rows.sort(key=lambda x: (x["score"], x["volume"]), reverse=True)
    return rows[:top_n]
