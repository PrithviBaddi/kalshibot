"""Optional automatic paper exits (take-profit / stop-loss at mid)."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from app.db import (
    insert_paper_sell,
    list_paper_executions_ordered,
    list_user_ids_with_enabled_rules,
)
from app.feature_flags import user_auth_enabled
from app.kalshi_runtime import get_kalshi_for_user
from app.request_context import reset_effective_user_id, set_effective_user_id
from app.strategy_store import get_config
from app.exit_policy import ExitPolicy, evaluate_exit
from app.positions import (
    compute_sell_realized_cents,
    exit_price_cents_for_side,
    market_yes_mid_cents,
    open_positions_from_state,
    replay_ledger,
)

logger = logging.getLogger(__name__)


async def run_paper_auto_exits_once(app_state: Any) -> dict[str, Any]:
    """
    Close full paper positions that hit take-profit or stop-loss vs current mid.

    Does nothing unless strategy.auto_exit_paper and paper_mode are True.
    """
    if user_auth_enabled():
        out: dict[str, Any] = {"closed": [], "by_user": []}
        for uid in list_user_ids_with_enabled_rules():
            tok = set_effective_user_id(uid)
            try:
                one = await _run_paper_auto_exits_for_user(app_state, uid)
                out["by_user"].append({"user_id": uid, **one})
                out["closed"].extend(one.get("closed") or [])
            finally:
                reset_effective_user_id(tok)
        out["count"] = len(out["closed"])
        return out

    return await _run_paper_auto_exits_for_user(app_state, None)


async def _run_paper_auto_exits_for_user(app_state: Any, uid: int | None) -> dict[str, Any]:
    cfg = get_config()
    if not cfg.paper_mode or not cfg.auto_exit_paper:
        return {"skipped": True, "reason": "auto_exit_paper_or_paper_mode_off"}

    if user_auth_enabled() and uid is not None:
        k = await get_kalshi_for_user(app_state, uid)
    else:
        k = getattr(app_state, "kalshi", None)
    if k is None:
        return {"skipped": True, "reason": "kalshi_not_configured"}

    executions = list_paper_executions_ordered()
    state, _ = replay_ledger(executions)
    open_pos = open_positions_from_state(state)
    if not open_pos:
        return {"closed": [], "message": "no open paper positions"}

    policy = ExitPolicy(
        take_profit_cents_per_contract=cfg.paper_take_profit_cents,
        stop_loss_cents_per_contract=cfg.paper_stop_loss_cents,
    )

    closed: list[dict[str, Any]] = []
    for pos in open_pos:
        market = await k.get_market_snapshot(pos.ticker)
        if not market:
            logger.warning("auto-exit: no snapshot for %s", pos.ticker)
            continue
        ymid = market_yes_mid_cents(market)
        if ymid is None:
            continue
        ev = evaluate_exit(pos, yes_mid_cents=ymid, policy=policy)
        if not ev.get("should_exit"):
            continue
        exit_px = exit_price_cents_for_side(side=pos.side, yes_mid_cents=ymid)
        executions = list_paper_executions_ordered()
        try:
            realized, _ = compute_sell_realized_cents(
                executions,
                ticker=pos.ticker,
                side=pos.side,
                sell_count=pos.open_count,
                exit_price_cents=exit_px,
            )
        except ValueError as e:
            logger.warning("auto-exit: %s", e)
            continue

        insert_paper_sell(
            payload={
                "ticker": pos.ticker,
                "side": pos.side,
                "price_cents": exit_px,
                "count": pos.open_count,
                "paper_mode": True,
                "auto_exit": True,
                "exit_reason": ev.get("reason"),
            },
            realized_pnl_cents=realized,
        )
        closed.append(
            {
                "ticker": pos.ticker,
                "side": pos.side,
                "count": pos.open_count,
                "exit_price_cents": exit_px,
                "realized_pnl_cents": realized,
                "reason": ev.get("reason"),
            }
        )

    return {"closed": closed, "count": len(closed)}


async def paper_exit_monitor_loop(app: Any) -> None:
    while True:
        sleep_s = max(5, int(os.getenv("PAPER_EXIT_INTERVAL_SECONDS", "60")))
        if user_auth_enabled():
            sleep_s = max(5, sleep_s)
            for uid in list_user_ids_with_enabled_rules():
                tok = set_effective_user_id(uid)
                try:
                    sleep_s = max(sleep_s, int(get_config().paper_exit_interval_seconds))
                finally:
                    reset_effective_user_id(tok)
        else:
            cfg = get_config()
            sleep_s = max(5, int(cfg.paper_exit_interval_seconds))
        await asyncio.sleep(sleep_s)
        try:
            await run_paper_auto_exits_once(app.state)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("paper exit monitor tick failed")
