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
    insert_paper_order,
    insert_rule_run,
    list_paper_orders,
    list_rule_runs,
    list_rule_runs_for_rule,
    list_rules,
    list_enabled_rules,
    get_rule,
    update_rule,
)
from app.strategy_store import get_config, init_strategy_from_db, update_config
from app.templates import validate_rule_config
from app.ticker_hub import TickerHub
from kalshi.client import KalshiClient
from app.jobs import (
    get_scheduler_interval_seconds,
    rules_scheduler_loop,
    run_all_enabled_rules_once,
)

load_dotenv()

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
        init_strategy_from_db()
        app.state.kalshi = KalshiClient()
        logger.info("Kalshi client initialized (base URL from env or default production)")
        app.state.ticker_hub = TickerHub(
            app.state.kalshi.rest_base,
            app.state.kalshi.api_key_id,
            app.state.kalshi.signing_private_key,
        )
        await app.state.ticker_hub.start()

        # Stage 9 scheduler: periodically run enabled rules (paper-only).
        interval_seconds = get_scheduler_interval_seconds()
        app.state.rules_scheduler_task = asyncio.create_task(
            rules_scheduler_loop(app, interval_seconds=interval_seconds),
            name="rules-scheduler",
        )
    except ValueError as e:
        app.state.kalshi = None
        app.state.ticker_hub = None
        logger.warning("Kalshi client disabled: %s", e)
    yield

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
        "**Live stream:** Swagger cannot test WebSockets. Use a terminal WebSocket client "
        "(see `wscat`) or any WS client pointed at `/api/v1/ws/ticker` while `uvicorn` is running."
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

    if series_ticker:
        data = await k.get_markets(
            limit=limit,
            cursor=cursor,
            mve_filter=mve_filter,
            series_ticker=series_ticker,
        )
        markets = data.get("markets", [])
        return {
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

    return {
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


@app.get("/api/v1/strategy")
async def get_strategy():
    """Stage 5: current bot strategy/risk settings."""
    return get_config().to_dict()


@app.put("/api/v1/strategy")
async def put_strategy(body: StrategyUpdateRequest):
    """Stage 5: update strategy/risk knobs (in-memory for now)."""
    cfg = update_config(**body.model_dump())
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
    k = getattr(request.app.state, "kalshi", None)
    if k is None:
        return {
            "allowed": False,
            "reasons": ["kalshi client not configured in server lifespan"],
            "paper_mode": False,
            "order_notional_cents": order_notional,
            "paper": True,
        }

    # Send the order to Kalshi.
    # This is intentionally not used unless paper_mode is OFF + confirm_live=true.
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


@app.get("/api/v1/dashboard/paper-orders")
async def dashboard_paper_orders(
    limit: int = Query(50, ge=1, le=200),
    rule_id: int | None = Query(None, description="Optional: filter paper orders by rule_id (from payload)"),
):
    orders = list_paper_orders(limit=limit)
    if rule_id is not None:
        orders = [o for o in orders if int(o.get("rule_id") or -1) == rule_id]
    return {"paper_orders": orders}


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
    results = await run_all_enabled_rules_once(
        app_state=request.app.state, daily_loss_cents=daily_loss_cents
    )
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
    k = getattr(request.app.state, "kalshi", None)
    if k is None:
        raise HTTPException(status_code=503, detail="Kalshi not configured")

    return await run_rule_once_internal(
        rule_id=rule_id,
        daily_loss_cents=body.daily_loss_cents,
        kalshi_client=k,
        cfg=get_config(),
    )


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
