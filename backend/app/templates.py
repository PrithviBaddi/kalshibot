"""Stage 8 templates: limit how risky/complex user rules can be."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TemplateSpec:
    template_id: str
    # Rule scanning controls
    mve_filter: str = "exclude"
    side: str = "yes"
    price_source: str = "mid"
    max_spread: float = 0.25
    min_volume: float = 0.0
    top_n_max: int = 20
    max_series_max: int = 3
    per_series_limit_max: int = 50

    # Execution controls
    order_count_max: int = 5
    max_trades_per_run_max: int = 3


TEMPLATES: dict[str, TemplateSpec] = {
    # Conservative MVP: liquid + tighter markets + small sizing.
    "safe-liquidity": TemplateSpec(
        template_id="safe-liquidity",
        mve_filter="exclude",
        side="yes",
        price_source="mid",
        max_spread=0.25,
        min_volume=0.0,
        top_n_max=20,
        max_series_max=3,
        per_series_limit_max=50,
        order_count_max=5,
        max_trades_per_run_max=3,
    ),
}


def get_template(template_id: str) -> TemplateSpec:
    if template_id not in TEMPLATES:
        raise ValueError(f"Unknown template_id: {template_id}")
    return TEMPLATES[template_id]


def validate_rule_config(template_id: str, cfg: dict) -> None:
    """
    Hard validation so users cannot create arbitrarily risky rules.
    Raises ValueError with a human-readable reason.
    """
    spec = get_template(template_id)

    if cfg.get("mve_filter") != spec.mve_filter:
        raise ValueError(f"template requires mve_filter={spec.mve_filter}")
    if cfg.get("side") != spec.side:
        raise ValueError(f"template requires side={spec.side}")
    if cfg.get("price_source") != spec.price_source:
        raise ValueError(f"template requires price_source={spec.price_source}")

    max_spread = float(cfg.get("max_spread"))
    if max_spread > spec.max_spread:
        raise ValueError(f"max_spread too high for template (>{spec.max_spread})")

    min_volume = float(cfg.get("min_volume"))
    if min_volume < spec.min_volume:
        raise ValueError(f"min_volume too low for template (<{spec.min_volume})")

    if int(cfg.get("top_n")) > spec.top_n_max:
        raise ValueError(f"top_n too high for template (>{spec.top_n_max})")
    if int(cfg.get("max_series")) > spec.max_series_max:
        raise ValueError(f"max_series too high for template (>{spec.max_series_max})")
    if int(cfg.get("per_series_limit")) > spec.per_series_limit_max:
        raise ValueError(
            f"per_series_limit too high for template (>{spec.per_series_limit_max})"
        )

    if int(cfg.get("order_count")) > spec.order_count_max:
        raise ValueError(f"order_count too high for template (>{spec.order_count_max})")
    if int(cfg.get("max_trades_per_run")) > spec.max_trades_per_run_max:
        raise ValueError(
            f"max_trades_per_run too high for template (>{spec.max_trades_per_run_max})"
        )

