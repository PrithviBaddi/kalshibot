#!/usr/bin/env python3
"""
Stage 9 validation tests.

Run:
  python3 backend/validation/stage9_validation.py
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, "backend")

# Make scheduler run quickly for the test.
os.environ["RULE_SCHEDULER_INTERVAL_SECONDS"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.db import count_rule_runs  # noqa: E402
from app.main import app  # noqa: E402


def main() -> None:
    with TestClient(app) as c:
        # Ensure paper_mode is ON + bot enabled.
        s = c.put(
            "/api/v1/strategy",
            json={
                "bot_enabled": True,
                "paper_mode": True,
                "max_position_cents": 1_000_000,
                "daily_loss_limit_cents": 1_000_000,
                "min_volume": 0,
                "max_spread": 1,
                "notes": "stage9-test",
                "blocked_keywords": [],
            },
        )
        assert s.status_code == 200, s.text

        # Create a safe rule.
        rule = c.post(
            "/api/v1/rules",
            json={
                "template_id": "safe-liquidity",
                "name": f"stage9-rule",
                "enabled": True,
                "config": {
                    "category": "Politics",
                    "mve_filter": "exclude",
                    "top_n": 5,
                    "min_volume": 0,
                    "max_spread": 0.2,
                    "max_series": 1,
                    "per_series_limit": 5,
                    "side": "yes",
                    "price_source": "mid",
                    "order_count": 1,
                    "max_trades_per_run": 1,
                },
            },
        )
        assert rule.status_code == 200, rule.text
        rule_id = rule.json()["rule_id"]

        before = count_rule_runs(rule_id)

        # Manual run endpoint (fast deterministic).
        manual = c.post("/api/v1/jobs/run-all-enabled-once", params={"daily_loss_cents": 0})
        assert manual.status_code == 200, manual.text

        after_manual = count_rule_runs(rule_id)
        assert after_manual > before, f"expected rule_runs to increase (before={before}, after={after_manual})"

        # Now wait for scheduler loop to run again.
        time.sleep(2)
        after_sched = count_rule_runs(rule_id)
        assert after_sched > after_manual, (
            f"expected scheduler to run again (after_manual={after_manual}, after_sched={after_sched})"
        )

        print("Stage 9 validation PASSED")


if __name__ == "__main__":
    main()

