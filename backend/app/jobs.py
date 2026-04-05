"""Stage 9: background jobs (periodic rule runs).

With KALSHIBOT_USER_AUTH, runs enabled rules once per user that has Kalshi credentials.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

from app.db import list_enabled_rules, list_user_ids_with_enabled_rules
from app.feature_flags import user_auth_enabled
from app.kalshi_runtime import get_kalshi_for_user
from app.request_context import reset_effective_user_id, set_effective_user_id
from app.strategy_store import get_config


async def run_all_enabled_rules_once(
    *,
    app_state: Any,
    daily_loss_cents: int | None,
    only_user_id: int | None = None,
):
    """
    Runs all enabled Stage 8 rules once per tenant (legacy: single global Kalshi).

    If `only_user_id` is set (manual API trigger in multi-tenant mode), only that user's rules run.
    """
    from app.main import run_rule_once_internal  # noqa: WPS433

    if user_auth_enabled():
        uids = list_user_ids_with_enabled_rules()
        if only_user_id is not None:
            uids = [u for u in uids if u == only_user_id]
        results: list[dict[str, Any]] = []
        for uid in uids:
            tok = set_effective_user_id(uid)
            try:
                k = await get_kalshi_for_user(app_state, uid)
                if k is None:
                    continue
                cfg = get_config()
                enabled = list_enabled_rules(limit=200)
                for r in enabled:
                    results.append(
                        await run_rule_once_internal(
                            rule_id=int(r["id"]),
                            daily_loss_cents=daily_loss_cents,
                            kalshi_client=k,
                            cfg=cfg,
                        )
                    )
            finally:
                reset_effective_user_id(tok)
        return results

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


async def rules_scheduler_loop(app: Any, *, interval_seconds: int) -> None:
    """
    Periodically runs all enabled rules.
    """
    app.state.rules_scheduler_running = True
    app.state.rules_scheduler_last_run_at = None
    app.state.rules_scheduler_last_result = None
    running_lock = asyncio.Lock()

    while True:
        await asyncio.sleep(interval_seconds)
        if user_auth_enabled():
            has_any = bool(list_user_ids_with_enabled_rules())
            if not has_any:
                continue
        elif not getattr(app.state, "kalshi", None):
            continue
        async with running_lock:
            if user_auth_enabled():
                any_paper = False
                for uid in list_user_ids_with_enabled_rules():
                    tok = set_effective_user_id(uid)
                    try:
                        if get_config().paper_mode:
                            any_paper = True
                            break
                    finally:
                        reset_effective_user_id(tok)
                if not any_paper:
                    continue
            else:
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
