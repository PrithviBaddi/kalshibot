"""
BLS public API helpers for economic release data (no API key required).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BLS_API = "https://api.bls.gov/publicAPI/v2/timeseries/data/"


async def fetch_latest_bls_series(series_id: str) -> dict[str, Any]:
    payload = {"seriesid": [series_id], "latest": "true"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
            resp = await client.post(_BLS_API, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("BLS fetch failed series=%s err=%s", series_id, e)
        return {"ok": False, "series_id": series_id, "error": str(e)}

    if not isinstance(data, dict):
        return {"ok": False, "series_id": series_id, "error": "invalid_response"}
    results = data.get("Results") if isinstance(data.get("Results"), dict) else {}
    slist = results.get("series") if isinstance(results, dict) else None
    if not isinstance(slist, list) or not slist:
        return {"ok": False, "series_id": series_id, "error": "missing_series"}
    s0 = slist[0] if isinstance(slist[0], dict) else {}
    rows = s0.get("data") if isinstance(s0, dict) else None
    if not isinstance(rows, list) or not rows:
        return {"ok": False, "series_id": series_id, "error": "missing_data"}
    r0 = rows[0] if isinstance(rows[0], dict) else {}
    val = str(r0.get("value") or "").strip()
    period = str(r0.get("periodName") or "").strip()
    year = str(r0.get("year") or "").strip()
    if not val:
        return {"ok": False, "series_id": series_id, "error": "empty_value"}
    return {
        "ok": True,
        "series_id": series_id,
        "value": val,
        "period_name": period,
        "year": year,
    }

