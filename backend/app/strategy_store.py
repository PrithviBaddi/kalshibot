"""Stage 5: simple in-memory strategy/risk config store."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


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

    def to_dict(self) -> dict:
        return asdict(self)


_CONFIG = StrategyConfig()


def get_config() -> StrategyConfig:
    return _CONFIG


def update_config(**kwargs) -> StrategyConfig:
    cfg = get_config()
    for k, v in kwargs.items():
        if v is not None and hasattr(cfg, k):
            setattr(cfg, k, v)
    return cfg
