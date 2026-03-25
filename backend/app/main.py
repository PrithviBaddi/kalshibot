"""
KalshiBot backend — Stage 2: REST shell; Stage 3: Kalshi WebSocket ticker fan-out.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path, Query, Request, WebSocket, WebSocketDisconnect

from app.deps import Kalshi
from app.scanner import top_opportunities
from app.ticker_hub import TickerHub
from kalshi.client import KalshiClient

load_dotenv()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.kalshi = KalshiClient()
        logger.info("Kalshi client initialized (base URL from env or default production)")
        app.state.ticker_hub = TickerHub(
            app.state.kalshi.rest_base,
            app.state.kalshi.api_key_id,
            app.state.kalshi.signing_private_key,
        )
        await app.state.ticker_hub.start()
    except ValueError as e:
        app.state.kalshi = None
        app.state.ticker_hub = None
        logger.warning("Kalshi client disabled: %s", e)
    yield
    hub = getattr(app.state, "ticker_hub", None)
    if hub is not None:
        await hub.stop()
    k = getattr(app.state, "kalshi", None)
    if k is not None:
        await k.aclose()
        logger.info("Kalshi HTTP client closed")


app = FastAPI(
    title="KalshiBot API",
    description=(
        "**Browse markets:** `GET /api/v1/markets`. If the first page is mostly sports combos, "
        "try **`mve_filter=exclude`** (Kalshi multivariate legs). Filter by topic with "
        "**`series_ticker`** (and paginate with **`cursor`** — there is no single “all at once” page).\n\n"
        "**One market snapshot:** `GET /api/v1/markets/{ticker}` paste that string (not the word `ticker`).\n\n"
        "**Live stream:** Swagger cannot test WebSockets. Use a terminal WebSocket client "
        "(see `wscat`) or any WS client pointed at `/api/v1/ws/ticker` while `uvicorn` is running."
    ),
    version="0.3.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Liveness: no Kalshi credentials required."""
    return {"status": "ok"}


@app.get("/api/v1/status")
async def api_status(request: Request):
    """Readiness: whether Kalshi credentials loaded and balance is reachable."""
    k = getattr(request.app.state, "kalshi", None)
    if k is None:
        return {
            "kalshi_configured": False,
            "message": "Set KALSHI_API_KEY_ID and private key env vars.",
        }
    try:
        bal = await k.get_balance()
        cents = bal.get("balance", 0)
        out = {
            "kalshi_configured": True,
            "balance_cents": cents,
            "balance_usd": round(cents / 100, 2),
        }
        hub = getattr(request.app.state, "ticker_hub", None)
        out["ticker_hub_running"] = hub.is_running()
        return out
    except Exception as e:
        logger.exception("Kalshi balance check failed")
        return {
            "kalshi_configured": True,
            "error": str(e),
        }


@app.get("/api/v1/series")
async def list_series(
    k: Kalshi,
    category: str | None = Query(
        None,
        description="Kalshi series category (e.g. politics, economics, climate — exact strings match Kalshi’s taxonomy).",
    ),
    tags: str | None = Query(None, description="Comma-separated or single tag filter per Kalshi API."),
    include_volume: bool = Query(False),
):
    """
    Discover `series_ticker` values. Use a returned `ticker` as `series_ticker` on `GET /api/v1/markets`.
    """
    return await k.get_series_list(
        category=category,
        tags=tags,
        include_volume=include_volume,
    )


@app.get("/api/v1/markets")
async def list_markets(
    k: Kalshi,
    limit: int = 20,
    cursor: str | None = None,
    series_ticker: str | None = Query(
        None,
        description="Kalshi `series_ticker` — narrows to one series (e.g. a politics/econ template).",
    ),
    event_ticker: str | None = Query(
        None,
        description="Kalshi `event_ticker` — all markets for a single event.",
    ),
    mve_filter: Literal["only", "exclude"] | None = Query(
        None,
        description=(
            "`exclude` drops multivariate combo markets (often floods early pages with sports parlays). "
            "`only` keeps only those."
        ),
    ),
):
    """
    Open markets (Kalshi GET /markets). Same global catalog as Kalshi; order is cursor-based, not “your” markets.
    Use `cursor` from the previous JSON to walk the rest of the exchange. For politics/weather, filter by
    `series_ticker` / `event_ticker` or exclude MVE rows.
    """
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")
    return await k.get_markets(
        limit=limit,
        cursor=cursor,
        series_ticker=series_ticker,
        event_ticker=event_ticker,
        mve_filter=mve_filter,
    )


@app.get("/api/v1/markets/{ticker}")
async def get_market(
    k: Kalshi,
    ticker: Annotated[
        str,
        Path(
            min_length=3,
            description=(
                "Exact Kalshi contract id from `GET /api/v1/markets` → each item’s `ticker` field "
                "(long string with hyphens). Using the literal word `ticker` or a short guess will 404."
            ),
        ),
    ],
):
    """Single market REST snapshot at request time (not a live stream; use WS for streaming)."""
    try:
        return await k.get_market(ticker)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Market not found") from e
        raise


@app.get("/api/v1/scanner/opportunities")
async def scanner_opportunities(
    k: Kalshi,
    top_n: int = Query(20, ge=1, le=100, description="How many ranked opportunities to return."),
    limit: int = Query(200, ge=1, le=200, description="How many markets to scan from current page."),
    cursor: str | None = Query(None, description="Optional markets cursor to scan a different page."),
    min_volume: float = Query(0.0, ge=0, description="Minimum volume filter."),
    max_spread: float = Query(1.0, ge=0, le=1, description="Maximum yes bid/ask spread."),
    mve_filter: Literal["only", "exclude"] | None = Query("exclude"),
    series_ticker: str | None = Query(None),
    include_sports: bool = Query(
        False,
        description="If false (default), sports markets are filtered out.",
    ),
):
    """
    Stage 4 scanner: returns a clean, ranked list from the raw Kalshi page.
    This is not a predictive model yet — it surfaces liquid + tighter markets first.
    """
    data = await k.get_markets(
        limit=limit,
        cursor=cursor,
        mve_filter=mve_filter,
        series_ticker=series_ticker,
    )
    markets = data.get("markets", [])
    return {
        "scanned_count": len(markets),
        "filters": {
            "min_volume": min_volume,
            "max_spread": max_spread,
            "mve_filter": mve_filter,
            "series_ticker": series_ticker,
            "include_sports": include_sports,
        },
        "cursor": data.get("cursor"),
        "note": "Increase min_volume and lower max_spread for stricter candidates.",
        "opportunities": top_opportunities(
            markets,
            top_n=top_n,
            min_volume=min_volume,
            max_spread=max_spread,
            include_sports=include_sports,
        ),
    }


@app.websocket("/api/v1/ws/ticker")
async def ticker_downstream(websocket: WebSocket):
    """
    Browser/client WebSocket: forwards Kalshi global `ticker` channel messages as JSON text.
    Do not inject HTTP Request here — use `websocket.app.state` only (HTTP Request breaks the handshake).
    """
    hub = getattr(websocket.app.state, "ticker_hub", None)
    if hub is None:
        await websocket.close(code=4000, reason="Kalshi not configured")
        return
    await websocket.accept()
    queue = await hub.register()
    try:
        while True:
            try:
                raw = await asyncio.wait_for(queue.get(), timeout=120.0)
            except TimeoutError:
                await websocket.send_json({"type": "heartbeat", "source": "kalshibot"})
                continue
            await websocket.send_text(raw)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await hub.unregister(queue)
        except Exception:
            logger.exception("ticker subscriber unregister failed")
