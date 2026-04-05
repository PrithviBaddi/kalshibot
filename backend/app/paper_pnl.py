"""Mark-to-market P&L for simulated (paper) positions using Kalshi REST snapshots."""

from __future__ import annotations

import asyncio
from typing import Any

from app.scanner import summarize_market
from kalshi.client import KalshiClient


def _clamp_cents(x: int) -> int:
    return max(1, min(99, x))


async def _fetch_market_snapshot(k: KalshiClient, ticker: str) -> dict[str, Any] | None:
    return await k.get_market_snapshot(ticker)


async def load_market_snapshots(
    k: KalshiClient, tickers: list[str], *, max_concurrent: int = 8
) -> dict[str, dict[str, Any] | None]:
    """Fetch GET /markets/{ticker} for each unique ticker (deduped)."""
    uniq = list(dict.fromkeys(tickers))
    sem = asyncio.Semaphore(max_concurrent)
    out: dict[str, dict[str, Any] | None] = {}

    async def one(t: str) -> None:
        async with sem:
            out[t] = await _fetch_market_snapshot(k, t)

    await asyncio.gather(*(one(t) for t in uniq))
    return out


def mtm_cents_for_order(
    *,
    side: str,
    price_cents: int,
    count: int,
    yes_mid_cents: int,
) -> tuple[int, int, int]:
    """
    Returns (cost_cents, mark_value_cents, unrealized_pnl_cents).

    Uses mid prices: approximate mark-to-market, not settlement P&L.
    """
    cost = int(price_cents) * int(count)
    y = _clamp_cents(int(yes_mid_cents))
    if side == "yes":
        mark = y * int(count)
    elif side == "no":
        no_mid = 100 - y
        mark = _clamp_cents(no_mid) * int(count)
    else:
        mark = cost
    return cost, mark, mark - cost


def enrich_paper_order(
    order: dict[str, Any], market: dict[str, Any] | None
) -> dict[str, Any]:
    """Adds `mtm` key to a paper order dict (copy)."""
    o = dict(order)
    if market is None:
        o["mtm"] = {
            "ok": False,
            "error": "market_unavailable",
            "detail": "Could not load this market from Kalshi (closed, delisted, or API error).",
        }
        return o

    s = summarize_market(market)
    yes_mid_cents = int(round(float(s.get("mid_prob") or 0.0) * 100))
    yes_mid_cents = _clamp_cents(yes_mid_cents) if yes_mid_cents else 50

    cost_cents, mark_cents, pnl_cents = mtm_cents_for_order(
        side=str(o.get("side") or "yes"),
        price_cents=int(o.get("price_cents") or 0),
        count=int(o.get("count") or 0),
        yes_mid_cents=yes_mid_cents,
    )

    o["mtm"] = {
        "ok": True,
        "market_title": market.get("title") or market.get("subtitle") or "",
        "yes_mid_cents": yes_mid_cents,
        "yes_mid_prob": round(float(s.get("mid_prob") or 0.0), 4),
        "cost_cents": cost_cents,
        "mark_value_cents": mark_cents,
        "unrealized_pnl_cents": pnl_cents,
        "unrealized_pnl_dollars": round(pnl_cents / 100.0, 2),
    }
    return o


def summarize_mtm_orders(orders: list[dict[str, Any]]) -> dict[str, Any]:
    cost = 0
    mark = 0
    pnl = 0
    n_ok = 0
    for o in orders:
        m = o.get("mtm") or {}
        if not m.get("ok"):
            continue
        n_ok += 1
        cost += int(m.get("cost_cents") or 0)
        mark += int(m.get("mark_value_cents") or 0)
        pnl += int(m.get("unrealized_pnl_cents") or 0)
    return {
        "orders_with_quote": n_ok,
        "total_cost_cents": cost,
        "total_mark_value_cents": mark,
        "total_unrealized_pnl_cents": pnl,
        "total_unrealized_pnl_dollars": round(pnl / 100.0, 2),
    }
