"""
KalshiBot backend — Stage 2: REST shell; Stage 3: Kalshi WebSocket ticker fan-out.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

import os

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.deps import Kalshi
from app.scanner import dedupe_markets_by_ticker, top_opportunities
from app.db import (
    create_rule,
    init_db,
    insert_analysis_snapshot,
    insert_paper_order,
    insert_paper_sell,
    insert_rule_run,
    list_analysis_snapshots,
    list_paper_executions_ordered,
    list_paper_orders,
    list_rule_runs,
    list_rule_runs_for_rule,
    list_rules,
    list_enabled_rules,
    get_rule,
    get_user_by_id,
    total_realized_pnl_cents,
    update_rule,
)
from app.strategy_store import get_config, init_strategy_from_db, update_config
from app.templates import validate_rule_config
from app.ticker_hub import TickerHub
from kalshi.client import KalshiClient
from app.daily_pick_schedulers import (
    daily_pick_generation_scheduler_loop,
    daily_pick_resolution_scheduler_loop,
)
from app.jobs import (
    get_scheduler_interval_seconds,
    rules_scheduler_loop,
    run_all_enabled_rules_once,
)
from app.paper_exit import paper_exit_monitor_loop
from app.paper_pnl import (
    enrich_paper_order,
    load_market_snapshots,
    summarize_mtm_orders,
)
from app.analysis import build_market_analysis
from app.claude_enrichment import enrich_analysis_with_claude
from app.news_context import fetch_news_block, headlines_for_claude
from app.positions import (
    build_position_snapshot,
    compute_sell_realized_cents,
    exit_price_cents_for_side,
    market_yes_mid_cents,
    open_positions_from_state,
    replay_ledger,
)
from app.exit_policy import ExitPolicy, evaluate_exit
from app.api_auth import AuthContextMiddleware, is_auth_enabled, websocket_token_ok
from app.feature_flags import jwt_secret, user_auth_enabled
from app.free_tier_guard import FreeTierApiGuardMiddleware
from app.jwt_tokens import decode_access_token
from app.plan_access import is_pro_subscriber
from app.routers import auth_api, billing_api, daily_pick_api, on_demand_api, testing_api

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)


class StrategyUpdateRequest(BaseModel):
    bot_enabled: bool | None = None
    paper_mode: bool | None = None
    max_position_cents: int | None = Field(default=None, ge=1, le=1_000_000)
    daily_loss_limit_cents: int | None = Field(default=None, ge=100, le=10_000_000)
    min_volume: float | None = Field(default=None, ge=0)
    max_spread: float | None = Field(default=None, ge=0, le=1)
    notes: str | None = None
    blocked_keywords: list[str] | None = None
    auto_exit_paper: bool | None = None
    paper_take_profit_cents: int | None = Field(default=None, ge=1, le=99)
    paper_stop_loss_cents: int | None = Field(default=None, ge=1, le=99)
    paper_exit_interval_seconds: int | None = Field(default=None, ge=5, le=3600)


class OrderRiskCheckRequest(BaseModel):
    ticker: str
    price_cents: int = Field(ge=1, le=99)
    count: int = Field(ge=1, le=100_000)
    daily_loss_cents: int | None = Field(
        default=None,
        ge=0,
        description="Optional: how much you are down today in cents. Used to enforce daily_loss_limit_cents.",
    )


class PlaceOrderRequest(BaseModel):
    """
    Stage 6: safe order placement request.

    IMPORTANT: `price_cents` is the price for the selected `side`.
    - side="yes": price_cents is YES price
    - side="no":  price_cents is NO price
    """

    ticker: str
    side: Literal["yes", "no"]
    price_cents: int = Field(ge=1, le=99)
    count: int = Field(ge=1, le=100_000)
    daily_loss_cents: int | None = Field(default=None, ge=0)
    confirm_live: bool = Field(
        default=False,
        description="Only required when paper_mode is OFF. Prevents accidental real trading.",
    )


class RuleConfigRequest(BaseModel):
    """
    Stage 8 (rules engine): defines how to pick markets and how to size a paper order.
    This MVP uses Kalshi's official category->series->markets scanning.
    """

    category: str = Field(description="Kalshi series category (same string as /api/v1/series).")
    mve_filter: Literal["only", "exclude"] = Field(default="exclude")
    top_n: int = Field(default=10, ge=1, le=100)
    min_volume: float = Field(default=0.0, ge=0)
    max_spread: float = Field(default=1.0, ge=0, le=1)

    # Speed knobs for MVP (keep runs fast).
    max_series: int = Field(default=5, ge=1, le=200)
    per_series_limit: int = Field(default=20, ge=1, le=200)

    side: Literal["yes", "no"] = Field(default="yes")
    price_source: Literal["yes_ask", "yes_bid", "mid"] = Field(default="yes_ask")

    order_count: int = Field(default=1, ge=1, le=100_000)
    max_trades_per_run: int = Field(default=3, ge=1, le=50)

    # Internal: safe template used to constrain this rule.
    template_id: str | None = Field(default=None, description="Internal template id used for validation.")


class RuleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    enabled: bool = True
    template_id: str = Field(default="safe-liquidity", description="Safe rule template id")
    config: RuleConfigRequest


class RuleUpdateRequest(BaseModel):
    enabled: bool
    name: str = Field(min_length=1, max_length=100)
    template_id: str = Field(default="safe-liquidity", description="Safe rule template id")
    config: RuleConfigRequest


class RuleRunOnceRequest(BaseModel):
    daily_loss_cents: int | None = Field(default=None, ge=0)


class AnalysisMarketRequest(BaseModel):
    """Stage 12A: request a probability + confidence read for one contract."""

    ticker: str = Field(min_length=3, max_length=512)
    title: str | None = Field(
        default=None,
        max_length=2000,
        description="Optional human title (e.g. from the page); stored in the response for UI.",
    )


class PaperCloseRequest(BaseModel):
    """Simulated sell at current mid (full or partial close)."""

    ticker: str = Field(min_length=3, max_length=512)
    side: Literal["yes", "no"]
    count: int | None = Field(
        default=None,
        ge=1,
        le=100_000,
        description="Contracts to close; omit to close the entire open lot.",
    )
    exit_price_cents: int | None = Field(
        default=None,
        ge=1,
        le=99,
        description=(
            "Optional: sell at this price for the chosen side (same convention as orders: "
            "YES side = yes cents, NO side = no cents). If set, Kalshi is not called — "
            "use the mark shown on Paper & P&L to avoid rate limits / missing quotes."
        ),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.user_kalshi_clients = {}
    try:
        init_db()
        init_strategy_from_db()
        logger.info("ANTHROPIC_API_KEY configured: %s", bool(os.getenv("ANTHROPIC_API_KEY", "").strip()))
        logger.info(
            "Daily pick window: MIN=%s days MAX=%s days",
            os.getenv("DAILY_PICK_MIN_DAYS", "2"),
            os.getenv("DAILY_PICK_MAX_DAYS", "90"),
        )
        logger.info(
            "Search provider: BRAVE=%s SERPER=%s TAVILY=%s",
            bool(os.getenv("BRAVE_API_KEY", "").strip()),
            bool(os.getenv("SERPER_API_KEY", "").strip()),
            bool(os.getenv("TAVILY_API_KEY", "").strip()),
        )
        if user_auth_enabled() and not jwt_secret():
            logger.warning(
                "KALSHIBOT_USER_AUTH is set but JWT_SECRET is empty — set JWT_SECRET or disable USER_AUTH."
            )
        if user_auth_enabled():
            app.state.kalshi = None
            app.state.ticker_hub = None
            logger.info("KALSHIBOT_USER_AUTH: Kalshi credentials are per-user (no global REST client).")
        else:
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

        # Stage 9 scheduler: periodically run enabled rules (paper-only).
        interval_seconds = get_scheduler_interval_seconds()
        app.state.rules_scheduler_task = asyncio.create_task(
            rules_scheduler_loop(app, interval_seconds=interval_seconds),
            name="rules-scheduler",
        )
        app.state.paper_exit_task = asyncio.create_task(
            paper_exit_monitor_loop(app),
            name="paper-exit-monitor",
        )
        app.state.daily_pick_gen_task = asyncio.create_task(
            daily_pick_generation_scheduler_loop(app),
            name="daily-pick-generation",
        )
        app.state.daily_pick_resolution_task = asyncio.create_task(
            daily_pick_resolution_scheduler_loop(app),
            name="daily-pick-resolution",
        )
    except Exception:
        logger.exception("lifespan startup failed")
        raise
    yield

    dpg = getattr(app.state, "daily_pick_gen_task", None)
    if dpg is not None:
        dpg.cancel()
        try:
            await dpg
        except asyncio.CancelledError:
            pass
    dpr = getattr(app.state, "daily_pick_resolution_task", None)
    if dpr is not None:
        dpr.cancel()
        try:
            await dpr
        except asyncio.CancelledError:
            pass

    pet = getattr(app.state, "paper_exit_task", None)
    if pet is not None:
        pet.cancel()
        try:
            await pet
        except asyncio.CancelledError:
            pass

    # Stop Stage 9 scheduler.
    sched_task = getattr(app.state, "rules_scheduler_task", None)
    if sched_task is not None:
        sched_task.cancel()
        try:
            await sched_task
        except asyncio.CancelledError:
            pass

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
        "**Live stream:** Swagger cannot test WebSockets. Use `wscat` or any WS client at "
        "`/api/v1/ws/ticker`. If `KALSHIBOT_API_TOKEN` is set, add `?token=` with the same value "
        "(browsers cannot send `Authorization` on WebSocket)."
    ),
    version="0.3.0",
    lifespan=lifespan,
)

_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_extra = os.environ.get("CORS_ORIGINS", "").strip()
if _extra:
    _cors_origins.extend([o.strip() for o in _extra.split(",") if o.strip()])

# FreeTier guard must run inside Auth (after user_id is set): register Free first, Auth last.
# Note: Starlette runs middleware in reverse registration order. We add CORS last so it runs first
# and handles browser preflight (OPTIONS) before auth/plan checks.
app.add_middleware(FreeTierApiGuardMiddleware)
app.add_middleware(AuthContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # MV3 extension IDs vary, so allow any chrome-extension origin.
    # This is required for the extension popup to call the backend directly.
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_api.router)
app.include_router(billing_api.router)
app.include_router(daily_pick_api.router)
app.include_router(testing_api.router)
app.include_router(on_demand_api.router)


@app.get("/health")
async def health():
    """Liveness: no Kalshi credentials required."""
    return {"status": "ok"}


@app.get("/api/v1/status")
async def api_status(request: Request):
    """Readiness: whether Kalshi credentials loaded and balance is reachable."""
    auth_required = is_auth_enabled()
    if user_auth_enabled():
        from app.api_auth import resolve_bearer_user_id
        from app.kalshi_runtime import get_kalshi_for_user

        # /api/v1/status is auth-exempt: middleware may default user_id to 1 when JWT is missing
        # or invalid. Resolve the account from Authorization explicitly.
        auth = request.headers.get("authorization") or ""
        bearer = auth[7:].strip() if auth.startswith("Bearer ") else ""
        if not bearer:
            return {
                "kalshi_configured": False,
                "auth_required": auth_required,
                "user_auth": True,
                "message": "Sign in so the server can load your saved Kalshi API keys.",
            }
        uid_resolved = resolve_bearer_user_id(bearer)
        if uid_resolved is None:
            return {
                "kalshi_configured": False,
                "auth_required": auth_required,
                "user_auth": True,
                "message": "Invalid or expired session. Sign in again.",
            }
        uid = uid_resolved
        k = await get_kalshi_for_user(request.app.state, uid)
        if k is None:
            return {
                "kalshi_configured": False,
                "auth_required": auth_required,
                "user_auth": True,
                "message": (
                    "No Kalshi keys for this account yet. Add them under Settings or Setup, "
                    "or use legacy KALSHI_* env vars only when USER_AUTH is off."
                ),
            }
        try:
            bal = await k.get_balance()
            cents = bal.get("balance", 0)
            return {
                "kalshi_configured": True,
                "auth_required": auth_required,
                "user_auth": True,
                "balance_cents": cents,
                "balance_usd": round(cents / 100, 2),
                "balance_dollars": f"{cents / 100:.2f}",
            }
        except Exception as e:
            logger.exception("Kalshi balance check failed")
            return {
                "kalshi_configured": True,
                "auth_required": auth_required,
                "user_auth": True,
                "error": str(e),
            }
    k = getattr(request.app.state, "kalshi", None)
    if k is None:
        return {
            "kalshi_configured": False,
            "auth_required": auth_required,
            "message": "Set KALSHI_API_KEY_ID and private key env vars.",
        }
    try:
        bal = await k.get_balance()
        cents = bal.get("balance", 0)
        out = {
            "kalshi_configured": True,
            "auth_required": auth_required,
            "balance_cents": cents,
            "balance_usd": round(cents / 100, 2),
            "balance_dollars": f"{cents / 100:.2f}",
        }
        hub = getattr(request.app.state, "ticker_hub", None)
        out["ticker_hub_running"] = hub.is_running()
        return out
    except Exception as e:
        logger.exception("Kalshi balance check failed")
        return {
            "kalshi_configured": True,
            "auth_required": auth_required,
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


@app.post("/api/v1/analysis/market")
async def analyze_market_endpoint(request: Request, body: AnalysisMarketRequest, k: Kalshi):
    """
    Stage 12A — AI-style signal shell: implied YES probability + confidence.

    **Baseline (no LLM):** `model_yes_probability` equals the order-book mid; `confidence`
    reflects liquidity (spread + volume), not clairvoyance. Stage 12B adds optional Claude;
    Stage 12C adds optional NewsAPI headlines (`analysis.news`).
    """
    from app.plan_access import analysis_enrichment_flags

    allow_claude, allow_news = analysis_enrichment_flags(request)
    try:
        data = await k.get_market(body.ticker)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Market not found") from e
        raise
    market = data.get("market") if isinstance(data, dict) else None
    if not isinstance(market, dict):
        if isinstance(data, dict) and data.get("ticker"):
            market = data
        else:
            raise HTTPException(status_code=502, detail="Unexpected Kalshi response shape")
    analysis = build_market_analysis(market, title_override=body.title)
    title_for_news = str(analysis.get("title") or body.title or "")
    if allow_news:
        news_block = await fetch_news_block(title_for_news)
    else:
        news_block = {"ok": False, "skipped": True, "reason": "upgrade_for_news"}
    analysis["news"] = news_block
    h_claude = headlines_for_claude(news_block) if allow_news else []
    enriched = None
    if allow_claude:
        enriched = await enrich_analysis_with_claude(
            analysis,
            market=market,
            news_headlines=h_claude or None,
        )
    if enriched is not None:
        analysis = enriched
    payload = {
        "ok": True,
        "analysis": analysis,
        "claude_enriched": enriched is not None,
        "news_fetched": bool(allow_news and news_block.get("ok")),
    }
    try:
        insert_analysis_snapshot(
            ticker=str(analysis.get("ticker") or body.ticker),
            title=str(analysis.get("title") or body.title or ""),
            analysis=analysis,
            claude_enriched=enriched is not None,
            news_fetched=bool(news_block.get("ok")),
        )
    except Exception:
        logger.exception("Failed to persist analysis snapshot")
    if user_auth_enabled():
        uid = int(getattr(request.state, "user_id", 0))
        if uid > 0:
            from app.db import record_successful_analysis

            record_successful_analysis(uid)
    return payload


@app.get("/api/v1/scanner/opportunities")
async def scanner_opportunities(
    request: Request,
    k: Kalshi,
    top_n: int = Query(20, ge=1, le=100, description="How many ranked opportunities to return."),
    limit: int = Query(200, ge=1, le=200, description="Page size when using series_ticker + cursor."),
    cursor: str | None = Query(
        None,
        description="Only for series_ticker mode: next page from Kalshi (bookmark). Ignored for category scans.",
    ),
    min_volume: float = Query(0.0, ge=0, description="Minimum volume filter."),
    max_spread: float = Query(1.0, ge=0, le=1, description="Maximum yes bid/ask spread."),
    mve_filter: Literal["only", "exclude"] | None = Query("exclude"),
    series_ticker: str | None = Query(
        None,
        description="Kalshi series ticker: scans one series (supports cursor pagination).",
    ),
    category: str | None = Query(
        None,
        description="Official Kalshi series category — same as GET /api/v1/series?category=...",
    ),
    categories: str | None = Query(
        None,
        description="Comma-separated categories, e.g. Politics,Economics. Uses Kalshi /series per category.",
    ),
    max_series: int = Query(40, ge=1, le=200, description="Max distinct series to query in category mode."),
    per_series_limit: int = Query(
        50,
        ge=1,
        le=200,
        description="Markets fetched per series in category mode.",
    ),
):
    """
    Stage 4 scanner: ranked list using **Kalshi’s** scoping — not keyword guessing.

    - **category** / **categories**: `GET /series?category=` then `GET /markets?series_ticker=` for each series.
    - **series_ticker**: one series; optional **cursor** for the next page of that series.
    """
    if series_ticker and (category or categories):
        raise HTTPException(
            status_code=400,
            detail="Use either series_ticker (one series) or category/categories — not both.",
        )

    from app.plan_access import enforce_scanner_quota, record_scanner_use

    if series_ticker:
        enforce_scanner_quota(request)
        data = await k.get_markets(
            limit=limit,
            cursor=cursor,
            mve_filter=mve_filter,
            series_ticker=series_ticker,
        )
        markets = data.get("markets", [])
        out = {
            "scan_mode": "series_ticker",
            "scanned_count": len(markets),
            "filters": {
                "min_volume": min_volume,
                "max_spread": max_spread,
                "mve_filter": mve_filter,
                "series_ticker": series_ticker,
                "category": None,
                "categories": None,
                "max_series": None,
                "per_series_limit": None,
            },
            "cursor": data.get("cursor"),
            "note": "Use cursor from this response for the next page of the same series_ticker.",
            "opportunities": top_opportunities(
                markets,
                top_n=top_n,
                min_volume=min_volume,
                max_spread=max_spread,
            ),
        }
        record_scanner_use(request)
        return out

    cats: list[str] = []
    if category:
        cats.append(category.strip())
    if categories:
        cats.extend([c.strip() for c in categories.split(",") if c.strip()])
    cats = [c for c in cats if c]

    if not cats:
        raise HTTPException(
            status_code=400,
            detail=(
                "Scope the scan using Kalshi’s taxonomy: pass category= or categories= "
                "(see GET /api/v1/series), or pass series_ticker= for one series. "
                "Kalshi does not support category= on GET /markets; use /series first."
            ),
        )

    if cursor:
        raise HTTPException(
            status_code=400,
            detail="cursor only applies when series_ticker is set. Category scans merge many series; use series_ticker + cursor to paginate one series.",
        )

    enforce_scanner_quota(request)

    series_seen: dict[str, dict] = {}
    for cat in cats:
        if len(series_seen) >= max_series:
            break
        ser = await k.get_series_list(category=cat)
        for s in ser.get("series", []):
            t = s.get("ticker")
            if t and t not in series_seen:
                series_seen[t] = s
            if len(series_seen) >= max_series:
                break

    all_markets: list[dict] = []
    for st in list(series_seen.keys()):
        d = await k.get_markets(
            limit=per_series_limit,
            mve_filter=mve_filter,
            series_ticker=st,
        )
        all_markets.extend(d.get("markets", []))

    markets = dedupe_markets_by_ticker(all_markets)

    out = {
        "scan_mode": "kalshi_category",
        "scanned_count": len(markets),
        "filters": {
            "min_volume": min_volume,
            "max_spread": max_spread,
            "mve_filter": mve_filter,
            "series_ticker": None,
            "category": category,
            "categories": categories,
            "max_series": max_series,
            "per_series_limit": per_series_limit,
        },
        "series_fetched": len(series_seen),
        "categories_resolved": cats,
        "cursor": None,
        "note": "Category mode has no single cursor. To paginate one series, call with series_ticker= that series and use cursor from that response.",
        "opportunities": top_opportunities(
            markets,
            top_n=top_n,
            min_volume=min_volume,
            max_spread=max_spread,
        ),
    }
    record_scanner_use(request)
    return out


@app.get("/api/v1/strategy")
async def get_strategy():
    """Stage 5: current bot strategy/risk settings."""
    return get_config().to_dict()


@app.put("/api/v1/strategy")
async def put_strategy(request: Request, body: StrategyUpdateRequest):
    """Stage 5: update strategy/risk knobs (in-memory for now)."""
    current = get_config()
    payload = body.model_dump(exclude_none=True)
    new_paper = payload["paper_mode"] if "paper_mode" in payload else current.paper_mode
    if user_auth_enabled() and new_paper is False:
        from app.plan_access import require_pro_subscriber

        require_pro_subscriber(request)
    cfg = update_config(**payload)
    return {"ok": True, "strategy": cfg.to_dict()}


@app.post("/api/v1/risk/check-order")
async def risk_check_order(body: OrderRiskCheckRequest):
    """
    Stage 5: pre-trade guardrails.
    Validates position size and mode rules before order placement is implemented.
    """
    cfg = get_config()
    order_notional = body.price_cents * body.count
    reasons: list[str] = []
    if not cfg.bot_enabled:
        reasons.append("bot is disabled")
    if order_notional > cfg.max_position_cents:
        reasons.append(
            f"order notional {order_notional}c exceeds max_position_cents {cfg.max_position_cents}c"
        )
    if body.daily_loss_cents is not None and body.daily_loss_cents >= cfg.daily_loss_limit_cents:
        reasons.append(
            f"daily loss limit hit: daily_loss_cents {body.daily_loss_cents}c >= daily_loss_limit_cents {cfg.daily_loss_limit_cents}c"
        )
    blocked = [w for w in cfg.blocked_keywords if w.lower() in body.ticker.lower()]
    if blocked:
        reasons.append(f"ticker blocked by keywords: {', '.join(blocked)}")
    return {
        "allowed": len(reasons) == 0,
        "reasons": reasons,
        "paper_mode": cfg.paper_mode,
        "order_notional_cents": order_notional,
    }


def _compute_risk_reasons(
    cfg,
    *,
    ticker: str,
    price_cents: int,
    count: int,
    daily_loss_cents: int | None,
) -> tuple[bool, list[str], int, bool]:
    """
    Shared risk logic for Stage 5 and Stage 6.

    Returns: (allowed, reasons, order_notional_cents, paper_mode)
    """
    reasons: list[str] = []
    order_notional = price_cents * count

    if not cfg.bot_enabled:
        reasons.append("bot is disabled")

    if order_notional > cfg.max_position_cents:
        reasons.append(
            f"order notional {order_notional}c exceeds max_position_cents {cfg.max_position_cents}c"
        )

    if daily_loss_cents is not None and daily_loss_cents >= cfg.daily_loss_limit_cents:
        reasons.append(
            f"daily loss limit hit: daily_loss_cents {daily_loss_cents}c >= daily_loss_limit_cents {cfg.daily_loss_limit_cents}c"
        )

    blocked = [w for w in cfg.blocked_keywords if w.lower() in ticker.lower()]
    if blocked:
        reasons.append(f"ticker blocked by keywords: {', '.join(blocked)}")

    allowed = len(reasons) == 0
    return allowed, reasons, order_notional, cfg.paper_mode


@app.post("/api/v1/orders/place")
async def place_order(body: PlaceOrderRequest, request: Request):
    """
    Stage 6: Place order in paper mode only (safe path).

    If `paper_mode` is OFF, the request must set `confirm_live=true` to allow
    a real `POST /orders` call to Kalshi (kept off by default).
    """
    cfg = get_config()

    # First run the same checks Stage 5 uses.
    allowed, reasons, order_notional, paper_mode = _compute_risk_reasons(
        cfg,
        ticker=body.ticker,
        price_cents=body.price_cents,
        count=body.count,
        daily_loss_cents=body.daily_loss_cents,
    )

    if not allowed:
        return {
            "allowed": False,
            "reasons": reasons,
            "paper_mode": paper_mode,
            "order_notional_cents": order_notional,
            "paper": True,
        }

    # If paper_mode is off, we still require an explicit confirmation flag.
    if not paper_mode:
        if not body.confirm_live:
            return {
                "allowed": False,
                "reasons": ["paper_mode is off and confirm_live=false"],
                "paper_mode": paper_mode,
                "order_notional_cents": order_notional,
                "paper": True,
            }
        from app.plan_access import require_pro_subscriber

        require_pro_subscriber(request)

    # Paper mode: do not call Kalshi.
    if paper_mode:
        yes_price = body.price_cents if body.side == "yes" else 100 - body.price_cents
        no_price = body.price_cents if body.side == "no" else 100 - body.price_cents
        record = {
            "ticker": body.ticker,
            "side": body.side,
            "price_cents": body.price_cents,
            "count": body.count,
            "order_notional_cents": order_notional,
            "paper_mode": True,
        }
        order_id = insert_paper_order(payload=record)
        return {
            "allowed": True,
            "paper": True,
            "paper_mode": True,
            "order_notional_cents": order_notional,
            "paper_order_id": order_id,
            "would_place": {
                "ticker": body.ticker,
                "side": body.side,
                "count": body.count,
                "yes_price_cents": yes_price,
                "no_price_cents": no_price,
            },
        }

    # Live mode (confirm_live must be true): call Kalshi.
    from app.kalshi_runtime import get_kalshi_for_user

    uid = int(getattr(request.state, "user_id", 1))
    if user_auth_enabled():
        k = await get_kalshi_for_user(request.app.state, uid)
    else:
        k = getattr(request.app.state, "kalshi", None)
    if k is None:
        return {
            "allowed": False,
            "reasons": ["kalshi client not configured for this account"],
            "paper_mode": False,
            "order_notional_cents": order_notional,
            "paper": True,
        }
    resp = await k.place_order(body.ticker, body.side, body.count, body.price_cents)
    return {
        "allowed": True,
        "paper": False,
        "paper_mode": False,
        "order_notional_cents": order_notional,
        "result": resp,
    }


@app.get("/api/v1/paper/orders")
async def get_paper_orders(limit: int = Query(100, ge=1, le=500)):
    """Stage 7: view paper orders persisted in SQLite."""
    return {"orders": list_paper_orders(limit=limit)}


@app.post("/api/v1/paper/close")
async def paper_close_position(body: PaperCloseRequest, k: Kalshi):
    """
    Simulate selling (closing) paper contracts at the current YES mid-derived price for that side.

    Records realized P&L in the paper ledger. Requires paper_mode.
    """
    cfg = get_config()
    if not cfg.paper_mode:
        raise HTTPException(status_code=400, detail="paper_mode is off; refusing simulated close")

    executions = list_paper_executions_ordered()
    state, _ = replay_ledger(executions)
    st = state.get((body.ticker, body.side.lower()), {"q": 0, "cost": 0})
    open_q = int(st.get("q") or 0)
    if open_q <= 0:
        raise HTTPException(status_code=400, detail="no open paper position for this ticker/side")

    sell_count = int(body.count) if body.count is not None else open_q
    if sell_count > open_q:
        raise HTTPException(status_code=400, detail=f"only {open_q} contracts open")

    if body.exit_price_cents is not None:
        exit_px = int(body.exit_price_cents)
    else:
        market = await k.get_market_snapshot(body.ticker)
        if not market:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not get a price quote from Kalshi. "
                    "Turn paper mode on, or retry — or pass exit_price_cents using the mark price from the UI."
                ),
            )

        ymid = market_yes_mid_cents(market)
        if ymid is None:
            raise HTTPException(status_code=502, detail="Could not compute mid for exit price")

        exit_px = exit_price_cents_for_side(side=body.side, yes_mid_cents=ymid)
    realized, _ = compute_sell_realized_cents(
        executions,
        ticker=body.ticker,
        side=body.side,
        sell_count=sell_count,
        exit_price_cents=exit_px,
    )
    eid = insert_paper_sell(
        payload={
            "ticker": body.ticker,
            "side": body.side,
            "price_cents": exit_px,
            "count": sell_count,
            "paper_mode": True,
            "manual_close": True,
            "used_client_exit_price": body.exit_price_cents is not None,
        },
        realized_pnl_cents=realized,
    )
    return {
        "ok": True,
        "execution_id": eid,
        "exit_price_cents": exit_px,
        "sell_count": sell_count,
        "realized_pnl_cents": realized,
        "total_realized_pnl_cents": total_realized_pnl_cents(),
    }


@app.get("/api/v1/dashboard/paper-positions")
async def dashboard_paper_positions(k: Kalshi):
    """Open paper lots (from ledger) with MTM unrealized P&L + lifetime realized from sells."""
    executions = list_paper_executions_ordered()
    state, _ = replay_ledger(executions)
    open_pos = open_positions_from_state(state)
    realized = total_realized_pnl_cents()
    if not open_pos:
        return {
            "open_positions": [],
            "total_realized_pnl_cents": realized,
            "total_unrealized_pnl_cents": 0,
            "note": "Unrealized P&L is mark-to-market on open lots; realized P&L is from simulated sells.",
        }

    tickers = list({p.ticker for p in open_pos})
    snapshots = await load_market_snapshots(k, tickers)
    mdict: dict[str, dict[str, Any] | None] = {t: snapshots.get(t) for t in tickers}
    rows = build_position_snapshot(open_pos, mdict)
    unrealized_sum = sum(int(r["unrealized_pnl_cents"] or 0) for r in rows if r.get("quote_ok"))
    return {
        "open_positions": rows,
        "total_realized_pnl_cents": realized,
        "total_unrealized_pnl_cents": unrealized_sum,
        "note": "Unrealized P&L is mark-to-market on open lots; realized P&L is from simulated sells.",
    }


@app.get("/api/v1/paper/exit-suggestions")
async def paper_exit_suggestions(k: Kalshi):
    """
    Heuristic take-profit / stop-loss flags vs current mid (uses strategy thresholds).

    News/Claude-driven exits are future work; this is pure price vs entry.
    """
    cfg = get_config()
    executions = list_paper_executions_ordered()
    state, _ = replay_ledger(executions)
    open_pos = open_positions_from_state(state)
    policy = ExitPolicy(
        take_profit_cents_per_contract=cfg.paper_take_profit_cents,
        stop_loss_cents_per_contract=cfg.paper_stop_loss_cents,
    )
    out: list[dict[str, Any]] = []
    for pos in open_pos:
        try:
            data = await k.get_market(pos.ticker)
        except httpx.HTTPStatusError:
            continue
        market = data.get("market") if isinstance(data, dict) else None
        if not isinstance(market, dict):
            market = data if isinstance(data, dict) and data.get("ticker") else None
        if not market:
            continue
        ymid = market_yes_mid_cents(market)
        if ymid is None:
            continue
        ev = evaluate_exit(pos, yes_mid_cents=ymid, policy=policy)
        out.append(
            {
                "ticker": pos.ticker,
                "side": pos.side,
                "open_count": pos.open_count,
                "avg_entry_cents": round(pos.avg_entry_cents, 2),
                **ev,
            }
        )
    return {"suggestions": out, "policy": policy.__dict__, "auto_exit_paper": cfg.auto_exit_paper}


#
# Stage 10: dashboard-friendly endpoints (backend-only)
#


@app.get("/api/v1/dashboard/strategy")
async def dashboard_strategy():
    cfg = get_config()
    return {"strategy": cfg.to_dict()}


@app.get("/api/v1/dashboard/rules")
async def dashboard_rules(limit: int = Query(100, ge=1, le=500)):
    return {"rules": list_rules(limit=limit), "enabled_rules": list_enabled_rules(limit=limit)}


@app.get("/api/v1/dashboard/rule-runs")
async def dashboard_rule_runs(
    limit: int = Query(50, ge=1, le=200),
    rule_id: int | None = Query(None, description="Optional: filter rule runs by rule_id"),
):
    if rule_id is None:
        return {"rule_runs": list_rule_runs(limit=limit)}
    return {"rule_runs": list_rule_runs_for_rule(rule_id=rule_id, limit=limit)}


@app.get("/api/v1/dashboard/analysis-recent")
async def dashboard_analysis_recent(
    limit: int = Query(30, ge=1, le=100),
):
    """Recent POST /api/v1/analysis/market results stored in SQLite (extension or API clients)."""
    return {"snapshots": list_analysis_snapshots(limit=limit)}


@app.get("/api/v1/dashboard/paper-orders")
async def dashboard_paper_orders(
    limit: int = Query(50, ge=1, le=200),
    rule_id: int | None = Query(None, description="Optional: filter paper orders by rule_id (from payload)"),
):
    orders = list_paper_orders(limit=limit)
    if rule_id is not None:
        orders = [o for o in orders if int(o.get("rule_id") or -1) == rule_id]
    return {"paper_orders": orders}


@app.get("/api/v1/dashboard/paper-pnl")
async def dashboard_paper_pnl(
    request: Request,
    limit: int = Query(100, ge=1, le=500),
):
    """
    Paper positions with mark-to-market unrealized P&L.

    Uses Kalshi REST snapshots (mid of YES bid/ask). This is not realized profit until markets settle.
    """
    orders = list_paper_orders(limit=limit)
    from app.kalshi_runtime import get_kalshi_for_user

    uid = int(getattr(request.state, "user_id", 1))
    if user_auth_enabled():
        k = await get_kalshi_for_user(request.app.state, uid)
    else:
        k = getattr(request.app.state, "kalshi", None)
    if k is None:
        enriched = [
            {
                **o,
                "mtm": {
                    "ok": False,
                    "error": "kalshi_not_configured",
                    "detail": "Set Kalshi API credentials on the server to compute live marks.",
                },
            }
            for o in orders
        ]
        summary = summarize_mtm_orders(enriched)
        summary["order_count"] = len(orders)
        return {
            "kalshi_configured": False,
            "summary": summary,
            "orders": enriched,
            "note": (
                "Unrealized P&L uses mid prices (mark-to-market). "
                "Configure Kalshi on the backend to fetch quotes."
            ),
        }

    tickers = [str(o.get("ticker") or "") for o in orders]
    snapshots = await load_market_snapshots(k, tickers)
    enriched = [enrich_paper_order(o, snapshots.get(str(o.get("ticker") or ""))) for o in orders]
    summary = summarize_mtm_orders(enriched)
    summary["order_count"] = len(orders)
    return {
        "kalshi_configured": True,
        "summary": summary,
        "orders": enriched,
        "note": (
            "Unrealized P&L uses mid prices (mark-to-market). "
            "Realized profit/loss applies after settlement."
        ),
    }


@app.get("/api/v1/dashboard/jobs")
async def dashboard_jobs(request: Request):
    task = getattr(request.app.state, "rules_scheduler_task", None)
    return {
        "running": bool(getattr(request.app.state, "rules_scheduler_running", False)),
        "last_run_at": getattr(request.app.state, "rules_scheduler_last_run_at", None),
        "task_alive": task is not None and not task.done(),
        "last_result": getattr(request.app.state, "rules_scheduler_last_result", None),
    }


@app.get("/api/v1/jobs/status")
async def jobs_status(request: Request):
    """Stage 9: show scheduler status."""
    task = getattr(request.app.state, "rules_scheduler_task", None)
    return {
        "rules_scheduler_running": bool(getattr(request.app.state, "rules_scheduler_running", False)),
        "rules_scheduler_last_run_at": getattr(request.app.state, "rules_scheduler_last_run_at", None),
        "rules_scheduler_task_alive": task is not None and not task.done(),
    }


@app.post("/api/v1/jobs/run-all-enabled-once")
async def run_all_enabled_once_endpoint(
    request: Request, daily_loss_cents: int | None = Query(None, ge=0)
):
    """Stage 9: manual trigger to run all enabled rules once."""
    from app.plan_access import enforce_manual_job_run_quota, record_manual_job_run

    enforce_manual_job_run_quota(request)
    uid = int(getattr(request.state, "user_id", 1))
    results = await run_all_enabled_rules_once(
        app_state=request.app.state,
        daily_loss_cents=daily_loss_cents,
        only_user_id=uid if user_auth_enabled() else None,
    )
    record_manual_job_run(request)
    return {"results": results}


def _dollars_to_cents(x: float) -> int:
    # Kalshi prices are in 0..1 dollars (e.g. 0.38 = 38 cents).
    return int(round(x * 100))


async def run_rule_once_internal(
    *,
    rule_id: int,
    daily_loss_cents: int | None,
    kalshi_client: Any,
    cfg: Any,
) -> dict[str, Any]:
    """
    Stage 8 rule runner, used by both the API endpoint and Stage 9 scheduler.

    Runs the rule once and creates paper orders only.
    """
    rule = get_rule(rule_id)
    if not rule:
        return {"run_id": None, "allowed": False, "reasons": ["rule not found"]}

    if not rule["enabled"]:
        return {
            "run_id": None,
            "allowed": False,
            "reasons": ["rule is disabled"],
            "rule": rule,
        }

    if not cfg.paper_mode:
        return {"run_id": None, "allowed": False, "reasons": ["paper_mode is off"]}

    # Keep risk guardrails consistent.
    rule_cfg = RuleConfigRequest(**rule["config"])

    # Safety: ensure rule still matches its template constraints.
    template_id = rule_cfg.template_id or "safe-liquidity"
    try:
        validate_rule_config(template_id, rule_cfg.model_dump())
    except ValueError as e:
        return {
            "run_id": None,
            "allowed": False,
            "reasons": [str(e)],
            "rule": rule,
        }

    # Resolve category -> series list (Kalshi taxonomy)
    series_resp = await kalshi_client.get_series_list(category=rule_cfg.category)
    series_list = series_resp.get("series", []) if isinstance(series_resp, dict) else []
    series_tickers = [s.get("ticker") for s in series_list if s.get("ticker")]
    series_tickers = series_tickers[: rule_cfg.max_series]

    # Scan markets for each series_ticker (open markets slice)
    all_markets: list[dict[str, Any]] = []
    for st in series_tickers:
        d = await kalshi_client.get_markets(
            limit=rule_cfg.per_series_limit,
            mve_filter=rule_cfg.mve_filter,
            series_ticker=st,
        )
        all_markets.extend(d.get("markets", []))

    markets = dedupe_markets_by_ticker(all_markets)

    opportunities = top_opportunities(
        markets,
        top_n=rule_cfg.top_n,
        min_volume=rule_cfg.min_volume,
        max_spread=rule_cfg.max_spread,
    )

    orders_result: list[dict[str, Any]] = []
    created = 0
    created_tickers: list[str] = []

    for opp in opportunities:
        if created >= rule_cfg.max_trades_per_run:
            break

        # Convert price_source into a valid YES cents in 1..99.
        if rule_cfg.price_source == "yes_ask":
            candidates = [
                ("yes_ask", opp.get("yes_ask")),
                ("yes_bid", opp.get("yes_bid")),
                ("mid", opp.get("mid_prob")),
            ]
        elif rule_cfg.price_source == "yes_bid":
            candidates = [
                ("yes_bid", opp.get("yes_bid")),
                ("yes_ask", opp.get("yes_ask")),
                ("mid", opp.get("mid_prob")),
            ]
        else:
            candidates = [
                ("mid", opp.get("mid_prob")),
                ("yes_ask", opp.get("yes_ask")),
                ("yes_bid", opp.get("yes_bid")),
            ]

        yes_cents: int | None = None
        for _, v in candidates:
            cents = _dollars_to_cents(float(v or 0.0))
            if 1 <= cents <= 99:
                yes_cents = cents
                break
        if yes_cents is None:
            continue

        order_price_cents = yes_cents if rule_cfg.side == "yes" else 100 - yes_cents
        if order_price_cents < 1 or order_price_cents > 99:
            continue

        allowed, reasons, order_notional, paper_mode = _compute_risk_reasons(
            cfg,
            ticker=opp["ticker"],
            price_cents=order_price_cents,
            count=rule_cfg.order_count,
            daily_loss_cents=daily_loss_cents,
        )

        if allowed and paper_mode:
            record = {
                "ticker": opp["ticker"],
                "side": rule_cfg.side,
                "price_cents": order_price_cents,
                "count": rule_cfg.order_count,
                "order_notional_cents": order_notional,
                "paper_mode": True,
                "rule_id": rule_id,
                "opportunity_title": opp.get("title"),
                "opportunity_score": opp.get("score"),
            }
            paper_order_id = insert_paper_order(payload=record)
            created += 1
            created_tickers.append(opp["ticker"])
            orders_result.append(
                {
                    "paper_order_id": paper_order_id,
                    "ticker": opp["ticker"],
                    "side": rule_cfg.side,
                    "price_cents": order_price_cents,
                    "count": rule_cfg.order_count,
                    "allowed": True,
                    "reasons": [],
                }
            )
        else:
            orders_result.append(
                {
                    "ticker": opp["ticker"],
                    "side": rule_cfg.side,
                    "price_cents": order_price_cents,
                    "count": rule_cfg.order_count,
                    "allowed": False,
                    "reasons": reasons,
                }
            )

    result = {
        "rule_id": rule_id,
        "allowed": True,
        "series_tickers_resolved": series_tickers,
        "markets_scanned": len(markets),
        "opportunities_ranked": len(opportunities),
        "paper_orders_created": created,
        "paper_order_tickers_created": created_tickers,
        "orders": orders_result[: rule_cfg.max_trades_per_run],
    }
    run_db_id = insert_rule_run(rule_id=rule_id, result=result)
    result["run_id"] = run_db_id
    return result


@app.post("/api/v1/rules")
async def create_rule_endpoint(body: RuleCreateRequest):
    """Stage 8: create a new trading rule (saved in SQLite)."""
    cfg = body.config.model_dump()
    cfg["template_id"] = body.template_id
    try:
        validate_rule_config(body.template_id, cfg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    rule_id = create_rule(enabled=body.enabled, name=body.name, config=cfg)
    return {"rule_id": rule_id}


@app.get("/api/v1/rules")
async def list_rules_endpoint(limit: int = Query(100, ge=1, le=500)):
    """Stage 8: list rules."""
    return {"rules": list_rules(limit=limit)}


@app.get("/api/v1/rules/{rule_id}")
async def get_rule_endpoint(rule_id: int):
    """Stage 8: fetch a single rule."""
    r = get_rule(rule_id)
    if not r:
        raise HTTPException(status_code=404, detail="Rule not found")
    return r


@app.put("/api/v1/rules/{rule_id}")
async def update_rule_endpoint(rule_id: int, body: RuleUpdateRequest):
    """Stage 8: update an existing rule."""
    cfg = body.config.model_dump()
    cfg["template_id"] = body.template_id
    try:
        validate_rule_config(body.template_id, cfg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    update_rule(rule_id, enabled=body.enabled, name=body.name, config=cfg)
    return {"ok": True}


@app.post("/api/v1/rules/{rule_id}/run-once")
async def run_rule_once_endpoint(
    rule_id: int, body: RuleRunOnceRequest, request: Request
):
    """
    Stage 8: run a rule once (one scan + up to N paper orders).

    This does not place real orders. It only creates paper orders via SQLite.
    """
    from app.kalshi_runtime import get_kalshi_for_user
    from app.plan_access import enforce_manual_job_run_quota, record_manual_job_run

    enforce_manual_job_run_quota(request)

    uid = int(getattr(request.state, "user_id", 1))
    if user_auth_enabled():
        k = await get_kalshi_for_user(request.app.state, uid)
    else:
        k = getattr(request.app.state, "kalshi", None)
    if k is None:
        raise HTTPException(status_code=503, detail="Kalshi not configured")

    result = await run_rule_once_internal(
        rule_id=rule_id,
        daily_loss_cents=body.daily_loss_cents,
        kalshi_client=k,
        cfg=get_config(),
    )
    if user_auth_enabled() and result.get("allowed"):
        record_manual_job_run(request)
    return result


@app.websocket("/api/v1/ws/ticker")
async def ticker_downstream(websocket: WebSocket):
    """
    Browser/client WebSocket: forwards Kalshi global `ticker` channel messages as JSON text.
    Do not inject HTTP Request here — use `websocket.app.state` only (HTTP Request breaks the handshake).

    When KALSHIBOT_API_TOKEN is set, pass the same value as query param: ?token=...
    (Browsers cannot set Authorization on WebSocket.)
    """
    if not websocket_token_ok(websocket):
        await websocket.close(code=1008, reason="Unauthorized")
        return

    if user_auth_enabled() and jwt_secret():
        from app.api_auth import get_api_token

        expected = get_api_token()
        q = (websocket.query_params.get("token") or "").strip()
        auth_h = (websocket.headers.get("authorization") or "").strip()
        bearer = auth_h[7:].strip() if auth_h.startswith("Bearer ") else ""
        admin_ws = bool(expected and (q == expected or bearer == expected))
        if not admin_ws:
            raw = q or bearer
            if raw:
                payload = decode_access_token(raw)
                if payload and payload.get("sub"):
                    try:
                        uid = int(payload["sub"])
                    except (TypeError, ValueError):
                        uid = 0
                    if uid > 0:
                        u = get_user_by_id(uid)
                        if u and not is_pro_subscriber(u):
                            await websocket.close(code=1008, reason="Pro subscription required for ticker stream")
                            return

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
