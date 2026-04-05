#!/usr/bin/env python3
"""
Stage 12A — Analysis API (market probability + confidence).

Run (from repo root):
  python3 backend/validation/stage12a_validation.py

With Kalshi credentials in the environment, also exercises POST /api/v1/analysis/market.
Without credentials, only the deterministic heuristic is validated (still a pass).
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, "backend")


def _auth_headers() -> dict[str, str]:
    tok = os.getenv("KALSHIBOT_API_TOKEN", "").strip()
    if not tok:
        return {}
    return {"Authorization": f"Bearer {tok}"}

from app.analysis import build_market_analysis  # noqa: E402


def test_heuristic_synthetic() -> None:
    fake = {
        "ticker": "KXTEST-SYNTHETIC-VALIDATION",
        "title": "Synthetic market for validation",
        "yes_bid_dollars": "0.4000",
        "yes_ask_dollars": "0.4200",
        "volume_fp": "50000",
        "open_interest_fp": "10000",
    }
    a = build_market_analysis(fake)
    assert a["ticker"] == fake["ticker"]
    assert 0.0 <= a["implied_yes_probability"] <= 1.0
    assert 0.0 <= a["model_yes_probability"] <= 1.0
    assert 0.08 <= a["confidence"] <= 0.92
    assert a["confidence_label"] in ("low", "medium", "high")
    assert a["source"] == "market_mid"
    assert a["edge_vs_market_yes"] == 0.0
    assert "factors" in a and "spread" in a["factors"]
    assert isinstance(a["rationale"], str) and len(a["rationale"]) > 10


def test_live_endpoint_if_configured() -> None:
    from fastapi.testclient import TestClient  # noqa: E402

    from app.main import app  # noqa: E402

    h = _auth_headers()
    with TestClient(app) as c:
        st = c.get("/api/v1/status").json()
        if not st.get("kalshi_configured"):
            print("Kalshi not configured — skipping POST /api/v1/analysis/market integration test.")
            return

        mresp = c.get("/api/v1/markets", params={"limit": 3, "mve_filter": "exclude"}, headers=h)
        assert mresp.status_code == 200, mresp.text
        markets = mresp.json().get("markets") or []
        assert len(markets) >= 1, "Need at least one open market from Kalshi"
        ticker = markets[0]["ticker"]

        aresp = c.post(
            "/api/v1/analysis/market",
            json={"ticker": ticker, "title": markets[0].get("title")},
            headers=h,
        )
        assert aresp.status_code == 200, aresp.text
        body = aresp.json()
        assert body.get("ok") is True
        assert isinstance(body.get("claude_enriched"), bool)
        assert isinstance(body.get("news_fetched"), bool)
        a = body["analysis"]
        assert isinstance(a.get("news"), dict)
        assert a["ticker"] == ticker
        assert "confidence" in a and "implied_yes_probability" in a
        print(f"Live analysis OK for {ticker[:40]}…")

        pp = c.get("/api/v1/dashboard/paper-positions", headers=h)
        assert pp.status_code == 200, pp.text
        pj = pp.json()
        assert "open_positions" in pj and "total_realized_pnl_cents" in pj
        print("Paper positions dashboard OK")


def main() -> None:
    test_heuristic_synthetic()
    print("Stage 12A heuristic (synthetic market) PASSED")
    test_live_endpoint_if_configured()
    print("Stage 12A validation PASSED")


if __name__ == "__main__":
    main()
