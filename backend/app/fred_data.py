"""
FRED (Federal Reserve Economic Data) — macro snapshot for Economics / Financials daily picks.

Uses a free API key from https://fred.stlouisfed.org/docs/api/api_key.html
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_FRED_OBS = "https://api.stlouisfed.org/fred/series/observations"


async def _latest_value(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    series_id: str,
    units: str | None = None,
) -> tuple[str | None, str | None]:
    params: dict[str, str | int] = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 1,
    }
    if units:
        params["units"] = units
    try:
        resp = await client.get(_FRED_OBS, params=params, timeout=httpx.Timeout(20.0))
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("FRED fetch failed series=%s err=%s", series_id, e)
        return None, None
    obs = data.get("observations") if isinstance(data, dict) else None
    if not isinstance(obs, list) or not obs:
        return None, None
    row = obs[0]
    if not isinstance(row, dict):
        return None, None
    val = row.get("value")
    if val in (None, ".", ""):
        return None, None
    date = str(row.get("date") or "").strip()
    return str(val).strip(), date or None


def _fmt_pct(raw: str | None, *, decimals: int = 2) -> str:
    if raw is None:
        return "n/a"
    try:
        v = float(raw)
        return f"{v:.{decimals}f}%"
    except (TypeError, ValueError):
        return "n/a"


async def fetch_fred_economic_context() -> dict[str, Any]:
    """
    Returns a single paragraph of latest macro indicators + optional error detail.
    CPI and real GDP use FRED's year-over-year percent change (units=pc1) when available.
    """
    key = os.getenv("FRED_API_KEY", "").strip()
    if not key:
        return {"ok": False, "paragraph": "", "error": "no_api_key"}

    out: dict[str, Any] = {"ok": False, "paragraph": "", "parts": {}}

    async with httpx.AsyncClient() as client:
        fed_v, fed_d = await _latest_value(client, api_key=key, series_id="FEDFUNDS")
        un_v, un_d = await _latest_value(client, api_key=key, series_id="UNRATE")
        cpi_v, cpi_d = await _latest_value(client, api_key=key, series_id="CPIAUCSL", units="pc1")
        gdp_v, gdp_d = await _latest_value(client, api_key=key, series_id="GDPC1", units="pc1")

    parts: dict[str, str] = {}
    if fed_v is not None:
        parts["fed"] = _fmt_pct(fed_v, decimals=2)
        parts["fed_date"] = fed_d or ""
    else:
        parts["fed"] = "n/a"

    if un_v is not None:
        parts["unemployment"] = _fmt_pct(un_v, decimals=1)
        parts["un_date"] = un_d or ""
    else:
        parts["unemployment"] = "n/a"

    if cpi_v is not None:
        parts["cpi_yoy"] = _fmt_pct(cpi_v, decimals=2)
        parts["cpi_date"] = cpi_d or ""
    else:
        parts["cpi_yoy"] = "n/a"

    if gdp_v is not None:
        parts["gdp_yoy"] = _fmt_pct(gdp_v, decimals=2)
        parts["gdp_date"] = gdp_d or ""
    else:
        parts["gdp_yoy"] = "n/a"

    paragraph = (
        "Current economic conditions: "
        f"Fed funds rate {parts['fed']}, "
        f"CPI year-over-year {parts['cpi_yoy']}, "
        f"unemployment {parts['unemployment']}, "
        f"latest real GDP year-over-year growth {parts['gdp_yoy']}."
    )

    ok = any(
        x is not None
        for x in (fed_v, un_v, cpi_v, gdp_v)
    )
    out["ok"] = ok
    out["paragraph"] = paragraph if ok else ""
    out["parts"] = parts
    if not ok:
        out["error"] = "no_observations"
    return out
