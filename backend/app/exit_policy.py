"""
Heuristic exit signals (take-profit / stop-loss on mark-to-market).

News, Claude confidence, and sub-second loops can be layered later; this uses price vs entry.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.positions import OpenPosition, unrealized_cents_for_position


@dataclass
class ExitPolicy:
    take_profit_cents_per_contract: int = 5
    stop_loss_cents_per_contract: int = 10


def evaluate_exit(
    pos: OpenPosition,
    *,
    yes_mid_cents: int,
    policy: ExitPolicy,
) -> dict[str, Any]:
    """
    Returns whether to exit now based on unrealized P&L per open contract (approximate).
    """
    u = unrealized_cents_for_position(pos, yes_mid_cents=yes_mid_cents)
    per = u / pos.open_count if pos.open_count else 0.0

    if per >= policy.take_profit_cents_per_contract:
        return {
            "should_exit": True,
            "reason": "take_profit",
            "unrealized_pnl_cents": u,
            "per_contract_cents": round(per, 2),
        }
    if per <= -policy.stop_loss_cents_per_contract:
        return {
            "should_exit": True,
            "reason": "stop_loss",
            "unrealized_pnl_cents": u,
            "per_contract_cents": round(per, 2),
        }
    return {
        "should_exit": False,
        "reason": "hold",
        "unrealized_pnl_cents": u,
        "per_contract_cents": round(per, 2),
    }
