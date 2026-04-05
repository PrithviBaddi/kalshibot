"""
Paper position ledger: buys/sells, average cost, realized + unrealized P&L.

Selling is simulated at the current YES mid (for YES) or NO mid (for NO) unless overridden.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.scanner import summarize_market


@dataclass
class OpenPosition:
    ticker: str
    side: str
    open_count: int
    avg_entry_cents: float
    cost_basis_cents: int


def _key(ticker: str, side: str) -> tuple[str, str]:
    return (ticker, side.lower())


def replay_ledger(
    executions: list[dict[str, Any]],
) -> tuple[dict[tuple[str, str], dict[str, Any]], int]:
    """
    Process executions in chronological order.

    Returns (state_per_key, total_realized_cents_from_ledger_math).

    State values: {"q": int, "cost": int} (cost = sum entry cents * qty for remaining).
    """
    state: dict[tuple[str, str], dict[str, int]] = {}
    realized = 0

    for ex in sorted(executions, key=lambda x: int(x["id"])):
        ticker = str(ex["ticker"])
        side = str(ex["side"]).lower()
        action = str(ex["action"]).lower()
        price = int(ex["price_cents"])
        cnt = int(ex["count"])
        k = _key(ticker, side)

        if action == "buy":
            st = state.get(k, {"q": 0, "cost": 0})
            nq = st["q"] + cnt
            nc = st["cost"] + price * cnt
            state[k] = {"q": nq, "cost": nc}
            continue

        if action != "sell":
            continue

        st = state.get(k, {"q": 0, "cost": 0})
        if st["q"] <= 0 or cnt <= 0:
            continue
        avg = st["cost"] / st["q"] if st["q"] else float(price)
        sell_qty = min(cnt, st["q"])
        pnl = int(round((price - avg) * sell_qty))
        realized += pnl
        new_q = st["q"] - sell_qty
        new_cost = st["cost"] - int(round(avg * sell_qty))
        state[k] = {"q": new_q, "cost": new_cost}

    return state, realized


def open_positions_from_state(state: dict[tuple[str, str], dict[str, int]]) -> list[OpenPosition]:
    out: list[OpenPosition] = []
    for (ticker, side), st in state.items():
        q = int(st.get("q") or 0)
        c = int(st.get("cost") or 0)
        if q <= 0:
            continue
        avg = c / q if q else 0.0
        out.append(
            OpenPosition(
                ticker=ticker,
                side=side,
                open_count=q,
                avg_entry_cents=avg,
                cost_basis_cents=c,
            )
        )
    return out


def unrealized_cents_for_position(
    pos: OpenPosition,
    *,
    yes_mid_cents: int,
) -> int:
    """Mark-to-market unrealized P&L in cents for an open lot (aggregate)."""
    y = max(1, min(99, int(yes_mid_cents)))
    if pos.side == "yes":
        mark_value = y * pos.open_count
    else:
        no_mid = 100 - y
        mark_value = max(1, min(99, no_mid)) * pos.open_count
    return int(mark_value - pos.cost_basis_cents)


def exit_price_cents_for_side(*, side: str, yes_mid_cents: int) -> int:
    """Price at which we simulate selling `side` at the current YES mid."""
    y = max(1, min(99, int(yes_mid_cents)))
    if side == "yes":
        return y
    return max(1, min(99, 100 - y))


def market_yes_mid_cents(market: dict[str, Any]) -> int | None:
    s = summarize_market(market)
    mid = float(s.get("mid_prob") or 0.0)
    c = int(round(mid * 100))
    if 1 <= c <= 99:
        return c
    return None


def compute_sell_realized_cents(
    executions: list[dict[str, Any]],
    *,
    ticker: str,
    side: str,
    sell_count: int,
    exit_price_cents: int,
) -> tuple[int, int]:
    """
    Using ledger state before the sell, return (realized_pnl_this_sell_cents, max_sellable_qty).

    Raises ValueError if not enough inventory.
    """
    state, _ = replay_ledger(executions)
    k = _key(ticker, side)
    st = state.get(k, {"q": 0, "cost": 0})
    q = int(st.get("q") or 0)
    if q <= 0:
        raise ValueError("no open position for this ticker/side")
    if sell_count > q:
        raise ValueError(f"cannot sell {sell_count}; only {q} open")
    cost = int(st.get("cost") or 0)
    avg = cost / q if q else 0.0
    realized = int(round((exit_price_cents - avg) * sell_count))
    return realized, q


def build_position_snapshot(
    open_pos: list[OpenPosition],
    markets_by_ticker: dict[str, dict[str, Any] | None],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for p in open_pos:
        m = markets_by_ticker.get(p.ticker)
        if not m:
            rows.append(
                {
                    "ticker": p.ticker,
                    "side": p.side,
                    "open_count": p.open_count,
                    "avg_entry_cents": round(p.avg_entry_cents, 2),
                    "cost_basis_cents": p.cost_basis_cents,
                    "mark_price_cents": None,
                    "unrealized_pnl_cents": None,
                    "quote_ok": False,
                }
            )
            continue
        ymid = market_yes_mid_cents(m)
        if ymid is None:
            rows.append(
                {
                    "ticker": p.ticker,
                    "side": p.side,
                    "open_count": p.open_count,
                    "avg_entry_cents": round(p.avg_entry_cents, 2),
                    "cost_basis_cents": p.cost_basis_cents,
                    "mark_price_cents": None,
                    "unrealized_pnl_cents": None,
                    "quote_ok": False,
                }
            )
            continue
        exit_px = exit_price_cents_for_side(side=p.side, yes_mid_cents=ymid)
        u = unrealized_cents_for_position(p, yes_mid_cents=ymid)
        rows.append(
            {
                "ticker": p.ticker,
                "side": p.side,
                "open_count": p.open_count,
                "avg_entry_cents": round(p.avg_entry_cents, 2),
                "cost_basis_cents": p.cost_basis_cents,
                "mark_price_cents": exit_px,
                "unrealized_pnl_cents": u,
                "quote_ok": True,
                "title": (m.get("title") or m.get("subtitle") or "")[:500],
            }
        )
    return rows
