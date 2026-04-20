"""
Automated daily pick generation (08:00 UTC) and resolution polling (every 6 hours).
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

from app.daily_pick_job import run_daily_pick_generation
from app.daily_pick_resolution import run_daily_pick_resolution_check
from app.db import get_global_daily_pick
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)

_DAILY_GEN_POLL_SEC = 45.0
_RESOLUTION_INTERVAL_SEC = int(os.getenv("DAILY_PICK_RESOLUTION_INTERVAL_SEC", str(6 * 3600)))
_ENABLE_DAILY_SCHEDULER = os.getenv("DAILY_PICK_AUTO_SCHEDULER", "1").strip() not in ("0", "false", "no")


async def daily_pick_generation_scheduler_loop(app: Any) -> None:
    """
    Once per UTC day during the 08:00 hour: generate today's pick if missing.
    Retries on failure every poll tick within that hour.
    """
    last_completed_day: str | None = None
    app.state.daily_pick_scheduler_last_gen_day = None
    app.state.daily_pick_scheduler_last_gen_error = None

    while True:
        try:
            await asyncio.sleep(_DAILY_GEN_POLL_SEC)
            if not _ENABLE_DAILY_SCHEDULER:
                continue
            now = datetime.now(timezone.utc)
            if now.hour != 8:
                continue
            day = now.strftime("%Y-%m-%d")
            if last_completed_day == day:
                continue

            if get_global_daily_pick(day):
                logger.info(
                    "daily_pick_scheduler: skip generation — pick already exists for %s",
                    day,
                )
                last_completed_day = day
                app.state.daily_pick_scheduler_last_gen_day = day
                app.state.daily_pick_scheduler_last_gen_error = None
                continue

            try:
                out = await run_daily_pick_generation()
                if out.get("skipped"):
                    logger.info(
                        "daily_pick_scheduler: generation skipped (already exists) for %s",
                        day,
                    )
                else:
                    logger.info("daily_pick_scheduler: generation succeeded for %s", day)
                last_completed_day = day
                app.state.daily_pick_scheduler_last_gen_day = day
                app.state.daily_pick_scheduler_last_gen_error = None
            except Exception as e:
                logger.exception("daily_pick_scheduler: generation failed for %s", day)
                app.state.daily_pick_scheduler_last_gen_error = repr(e)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("daily_pick_scheduler: loop error")


async def daily_pick_resolution_scheduler_loop(app: Any) -> None:
    """Every 6 hours (configurable), poll Kalshi for unsettled daily picks."""
    await asyncio.sleep(15)
    while True:
        try:
            if not _ENABLE_DAILY_SCHEDULER:
                await asyncio.sleep(float(_RESOLUTION_INTERVAL_SEC))
                continue
            try:
                k = KalshiClient()
            except ValueError as e:
                logger.warning("daily_pick_resolution_scheduler: Kalshi not configured: %s", e)
                await asyncio.sleep(float(_RESOLUTION_INTERVAL_SEC))
                continue
            try:
                summary = await run_daily_pick_resolution_check(k)
                app.state.daily_pick_resolution_last_summary = summary
                app.state.daily_pick_resolution_last_at = int(
                    datetime.now(timezone.utc).timestamp()
                )
                if summary.get("updated"):
                    logger.info(
                        "daily_pick_resolution_scheduler: recorded resolutions for days=%s",
                        summary["updated"],
                    )
            finally:
                await k.aclose()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("daily_pick_resolution_scheduler: run failed")
        await asyncio.sleep(float(_RESOLUTION_INTERVAL_SEC))
