"""Internal batch calibration endpoints (admin API token or is_admin JWT)."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api_auth import get_api_token
from app.batch_test_job import run_batch_analyze_background
from app.db import (
    get_batch_test_accuracy_stats,
    get_user_by_id,
    list_batch_test_picks_for_run,
    list_batch_test_runs,
)
from app.feature_flags import user_auth_enabled

router = APIRouter(prefix="/api/v1/testing", tags=["testing"])

_batch_tasks: dict[str, asyncio.Task[Any]] = {}


class BatchAnalyzeBody(BaseModel):
    categories: list[str] | None = None
    top_n: int = Field(default=30, ge=1, le=100)


def _require_testing_admin(request: Request) -> None:
    expected = get_api_token()
    auth = request.headers.get("authorization") or ""
    bearer = auth[7:].strip() if auth.startswith("Bearer ") else ""
    if expected and bearer == expected:
        return
    if user_auth_enabled():
        uid = int(getattr(request.state, "user_id", 0))
        user = get_user_by_id(uid) if uid > 0 else None
        if user and int(user.get("is_admin") or 0) == 1:
            return
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Set KALSHIBOT_API_TOKEN or sign in as an admin user (is_admin=1).",
        )
    raise HTTPException(status_code=403, detail="Admin access required for batch testing.")


@router.post("/batch-analyze")
async def batch_analyze(request: Request, body: BatchAnalyzeBody) -> dict[str, Any]:
    _require_testing_admin(request)
    run_id = str(uuid.uuid4())
    task = asyncio.create_task(
        run_batch_analyze_background(run_id, body.categories, top_n=body.top_n)
    )
    _batch_tasks[run_id] = task

    def _done(t: asyncio.Task[Any]) -> None:
        _batch_tasks.pop(run_id, None)
        try:
            t.result()
        except Exception:
            pass

    task.add_done_callback(_done)
    return {"ok": True, "run_id": run_id, "status": "started", "top_n": body.top_n}


@router.get("/batch-runs")
async def batch_runs(request: Request) -> dict[str, Any]:
    _require_testing_admin(request)
    return {"ok": True, "runs": list_batch_test_runs()}


@router.get("/batch-runs/{run_id}")
async def batch_run_detail(request: Request, run_id: str) -> dict[str, Any]:
    _require_testing_admin(request)
    picks = list_batch_test_picks_for_run(run_id)
    if not picks:
        runs = {r["run_id"] for r in list_batch_test_runs()}
        if run_id not in runs and run_id not in _batch_tasks:
            raise HTTPException(status_code=404, detail="Batch run not found.")
    return {"ok": True, "run_id": run_id, "picks": picks}


@router.get("/accuracy")
async def batch_accuracy(request: Request) -> dict[str, Any]:
    _require_testing_admin(request)
    stats = get_batch_test_accuracy_stats()
    return {"ok": True, **stats}
