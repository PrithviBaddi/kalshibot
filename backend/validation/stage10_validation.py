#!/usr/bin/env python3
"""
Stage 10 validation tests (dashboard endpoints).

Run:
  python3 backend/validation/stage10_validation.py
"""

from __future__ import annotations

import sys
import time

sys.path.insert(0, "backend")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def main() -> None:
    with TestClient(app) as c:
        # Paper-only + bot on
        s = c.put(
            "/api/v1/strategy",
            json={
                "bot_enabled": True,
                "paper_mode": True,
                "max_position_cents": 1_000_000,
                "daily_loss_limit_cents": 1_000_000,
                "min_volume": 0,
                "max_spread": 1,
                "notes": "stage10-validation",
                "blocked_keywords": [],
            },
        )
        assert s.status_code == 200, s.text

        # Create a rule
        category = "Politics"
        rule_name = f"stage10-rule-{int(time.time())}"
        create = c.post(
            "/api/v1/rules",
            json={
                "template_id": "safe-liquidity",
                "name": rule_name,
                "enabled": True,
                "config": {
                    "category": category,
                    "mve_filter": "exclude",
                    "top_n": 5,
                    "min_volume": 0,
                    "max_spread": 0.2,
                    "max_series": 1,
                    "per_series_limit": 10,
                    "side": "yes",
                    "price_source": "mid",
                    "order_count": 1,
                    "max_trades_per_run": 1,
                },
            },
        )
        assert create.status_code == 200, create.text
        rule_id = create.json()["rule_id"]

        # Run rule once
        run = c.post(f"/api/v1/rules/{rule_id}/run-once", json={"daily_loss_cents": 0})
        assert run.status_code == 200, run.text

        # Dashboard checks
        strat = c.get("/api/v1/dashboard/strategy").json()
        assert strat["strategy"]["paper_mode"] is True

        rules = c.get("/api/v1/dashboard/rules").json()
        assert any(r.get("id") == rule_id for r in rules.get("rules", []))

        runs = c.get("/api/v1/dashboard/rule-runs", params={"rule_id": rule_id}).json()
        assert len(runs.get("rule_runs", [])) >= 1

        # Paper orders: should show at least the paper orders created by the run (if created > 0)
        paper_orders = c.get(
            "/api/v1/dashboard/paper-orders",
            params={"rule_id": rule_id, "limit": 50},
        ).json()
        orders = paper_orders.get("paper_orders", [])
        assert all(int(o.get("rule_id")) == rule_id for o in orders if o.get("rule_id") is not None)

        # Jobs status endpoint exists
        jobs = c.get("/api/v1/dashboard/jobs").json()
        assert "running" in jobs and "last_run_at" in jobs

        print("Stage 10 validation PASSED")


if __name__ == "__main__":
    main()

