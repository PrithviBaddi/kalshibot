"""Stage 5: strategy/risk config — per-user when Stage 12 multi-tenant is active."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from app.db import load_strategy, save_strategy
from app.request_context import get_effective_user_id, reset_effective_user_id, set_effective_user_id


@dataclass
class StrategyConfig:
    bot_enabled: bool = False
    paper_mode: bool = True
    max_position_cents: int = 2_500
    daily_loss_limit_cents: int = 10_000
    min_volume: float = 1000.0
    max_spread: float = 0.2
    notes: str = ""
    blocked_keywords: list[str] = field(default_factory=lambda: ["nba", "nhl", "nfl", "mlb", "ufc", "atp", "wta"])
    auto_exit_paper: bool = False
    paper_take_profit_cents: int = 5
    paper_stop_loss_cents: int = 10
    paper_exit_interval_seconds: int = 60

    def to_dict(self) -> dict:
        return asdict(self)


_config_cache: dict[int, StrategyConfig] = {}


def _fresh_config_from_dict(data: dict | None) -> StrategyConfig:
    cfg = StrategyConfig()
    if not data:
        return cfg
    for k, v in data.items():
        if hasattr(cfg, k) and v is not None:
            setattr(cfg, k, v)
    return cfg


def init_strategy_from_db() -> None:
    """Load persisted strategy for default tenant (user 1) on startup."""
    token = set_effective_user_id(1)
    try:
        data = load_strategy()
        if not data:
            return
        _config_cache[1] = _fresh_config_from_dict(data)
    finally:
        reset_effective_user_id(token)


def persist_strategy_to_db() -> None:
    save_strategy(get_config().to_dict())


def get_config() -> StrategyConfig:
    uid = get_effective_user_id()
    if uid not in _config_cache:
        data = load_strategy()
        _config_cache[uid] = _fresh_config_from_dict(data)
    return _config_cache[uid]


def update_config(**kwargs) -> StrategyConfig:
    cfg = get_config()
    for k, v in kwargs.items():
        if v is not None and hasattr(cfg, k):
            setattr(cfg, k, v)
    persist_strategy_to_db()
    uid = get_effective_user_id()
    _config_cache[uid] = cfg
    return cfg


def invalidate_strategy_cache(user_id: int | None = None) -> None:
    if user_id is None:
        _config_cache.clear()
    else:
        _config_cache.pop(user_id, None)
