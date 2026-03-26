"""Lightweight market scanner for Stage 4."""

from __future__ import annotations

from typing import Any


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

    score = round(
        (1.0 - min(spread, 1.0)) * 60
        + min(volume / 100000.0, 1.0) * 20
        + min(oi / 100000.0, 1.0) * 20,
        2,
    )

    return {
        "ticker": m.get("ticker"),
        "title": m.get("title"),
        "series_ticker": m.get("series_ticker"),
        "category": m.get("category"),
        "close_time": m.get("close_time"),
        "yes_bid": yes_bid,
        "yes_ask": yes_ask,
        "mid_prob": round(mid, 4),
        "spread": round(spread, 4),
        "volume": volume,
        "open_interest": oi,
        "score": score,
    }


def dedupe_markets_by_ticker(markets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for m in markets:
        t = m.get("ticker")
        if t:
            seen[str(t)] = m
    return list(seen.values())


def top_opportunities(
    markets: list[dict[str, Any]],
    *,
    top_n: int,
    min_volume: float,
    max_spread: float,
) -> list[dict[str, Any]]:
    rows = []
    for m in markets:
        s = summarize_market(m)
        if s["volume"] < min_volume:
            continue
        if s["spread"] > max_spread:
            continue
        rows.append(s)
    rows.sort(key=lambda x: (x["score"], x["volume"]), reverse=True)
    return rows[:top_n]
