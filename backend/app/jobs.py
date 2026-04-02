"""Stage 9: background jobs (periodic rule runs).

This scheduler is paper-only for now (it relies on Stage 5/6 risk + paper_mode).
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

from app.db import list_enabled_rules
from app.strategy_store import get_config


async def run_all_enabled_rules_once(*, app_state: Any, daily_loss_cents: int | None):
    """
    Runs all enabled Stage 8 rules once.
    The actual rule execution is handled inside main.py's helper.
    """
    # Import inside function to avoid circular imports at module load time.
    from app.main import run_rule_once_internal  # noqa: WPS433

    cfg = get_config()
    k = getattr(app_state, "kalshi", None)
    if k is None:
        raise RuntimeError("Kalshi client not configured")

    enabled = list_enabled_rules(limit=200)
    results: list[dict[str, Any]] = []
    for r in enabled:
        results.append(
            await run_rule_once_internal(
                rule_id=int(r["id"]),
                daily_loss_cents=daily_loss_cents,
                kalshi_client=k,
                cfg=cfg,
            )
        )
    return results


async def rules_scheduler_loop(app: Any, *, interval_seconds: int):
    """
    Periodically runs all enabled rules.
    """
    app.state.rules_scheduler_running = True
    app.state.rules_scheduler_last_run_at = None
    app.state.rules_scheduler_last_result = None
    running_lock = asyncio.Lock()

    while True:
        await asyncio.sleep(interval_seconds)
        if not getattr(app.state, "kalshi", None):
            continue
        async with running_lock:
            # Paper-only safety: never run if paper_mode is off.
            cfg = get_config()
            if not cfg.paper_mode:
                continue
            try:
                results = await run_all_enabled_rules_once(
                    app_state=app.state, daily_loss_cents=None
                )
                app.state.rules_scheduler_last_result = results
                app.state.rules_scheduler_last_run_at = int(time.time())
            except Exception as e:
                app.state.rules_scheduler_last_result = {"error": str(e)}
                app.state.rules_scheduler_last_run_at = int(time.time())


def get_scheduler_interval_seconds() -> int:
    return int(os.getenv("RULE_SCHEDULER_INTERVAL_SECONDS", "30"))

