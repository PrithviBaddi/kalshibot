#!/usr/bin/env python3
"""
Stage 8 validation tests.

Run from repo root:
  python3 backend/validation/stage8_validation.py
"""

from __future__ import annotations

import sys
import time

from fastapi.testclient import TestClient

sys.path.insert(0, "backend")

from app.main import app  # noqa: E402


def count_paper_orders_for_rule(resp_json: dict, rule_id: int) -> list[dict]:
    orders = resp_json.get("orders", [])
    out = []
    for o in orders:
        if o.get("rule_id") == rule_id:
            out.append(o)
    return out


def main() -> None:
    with TestClient(app) as c:
        # Ensure strategy is in paper mode.
        put = c.put(
            "/api/v1/strategy",
            json={
                "bot_enabled": True,
                "paper_mode": True,
                "max_position_cents": 1_000_000,
                "daily_loss_limit_cents": 1_000_000,
                "min_volume": 0,
                "max_spread": 1,
                "notes": "stage8-validation",
                "blocked_keywords": [],
            },
        )
        assert put.status_code == 200, put.text

        # Pick a safe-scanner set of parameters.
        category = "Politics"
        scanner_params = {
            "category": category,
            "top_n": 10,
            "min_volume": 0,
            "max_spread": 0.2,
            "mve_filter": "exclude",
            "max_series": 2,
            "per_series_limit": 20,
        }

        scan = c.get("/api/v1/scanner/opportunities", params=scanner_params)
        assert scan.status_code == 200, scan.text
        opportunities = scan.json().get("opportunities", [])
        opp_tickers = {o.get("ticker") for o in opportunities if o.get("ticker")}

        # Create a rule using the safe template.
        rule_name = f"stage8-rule-{int(time.time())}"
        create = c.post(
            "/api/v1/rules",
            json={
                "template_id": "safe-liquidity",
                "name": rule_name,
                "enabled": True,
                "config": {
                    **{
                        "category": category,
                        "mve_filter": "exclude",
                        "top_n": 10,
                        "min_volume": 0,
                        "max_spread": 0.2,
                        "max_series": 2,
                        "per_series_limit": 20,
                        "side": "yes",
                        "price_source": "mid",
                        "order_count": 1,
                        "max_trades_per_run": 2,
                    }
                },
            },
        )
        assert create.status_code == 200, create.text
        rule_id = create.json()["rule_id"]

        # Count before run (so we can verify delta == paper_orders_created).
        before = c.get("/api/v1/paper/orders", params={"limit": 200}).json()
        before_for_rule = count_paper_orders_for_rule(before, rule_id)

        run = c.post(f"/api/v1/rules/{rule_id}/run-once", json={"daily_loss_cents": 0})
        assert run.status_code == 200, run.text
        j = run.json()
        created = j.get("paper_orders_created")
        created_tickers = set(j.get("paper_order_tickers_created", []))

        after = c.get("/api/v1/paper/orders", params={"limit": 200}).json()
        after_for_rule = count_paper_orders_for_rule(after, rule_id)
        delta = len(after_for_rule) - len(before_for_rule)

        # Pass assertions
        assert created == delta, f"delta mismatch: created={created} delta={delta}"
        assert len(created_tickers) <= 2, "should not exceed max_trades_per_run"

        # If any paper orders were created, their tickers should be in the scanned opportunities set.
        if created > 0:
            missing = created_tickers - opp_tickers
            assert not missing, f"paper orders tickers not in opportunities set: {list(missing)[:5]}"

        # Template enforcement test: attempt to violate max_spread for template.
        create_bad = c.post(
            "/api/v1/rules",
            json={
                "template_id": "safe-liquidity",
                "name": f"{rule_name}-bad",
                "enabled": True,
                "config": {
                    "category": category,
                    "mve_filter": "exclude",
                    "top_n": 10,
                    "min_volume": 0,
                    "max_spread": 0.9,  # too high for safe-liquidity
                    "max_series": 2,
                    "per_series_limit": 20,
                    "side": "yes",
                    "price_source": "mid",
                    "order_count": 1,
                    "max_trades_per_run": 2,
                },
            },
        )
        assert create_bad.status_code == 400, create_bad.text

        print("Stage 8 validation PASSED")


if __name__ == "__main__":
    main()

