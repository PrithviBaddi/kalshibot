# Stage 10 — API ↔ UI parity audit

**Purpose:** Map every FastAPI route to **web app**, **extension**, or **intentionally not exposed** (Swagger/scripts only). Update this file when routes or UIs change.

**Legend:** ✅ Web · 🔌 Extension · ⏭️ Skip UI (by design) · ❌ Gap (consider adding UI or document forever)

---

## Read endpoints

| Method | Path | Web | Extension | Notes |
|--------|------|-----|-----------|--------|
| GET | `/health` | ⏭️ | ⏭️ | Ops / load balancers |
| GET | `/api/v1/status` | ✅ `layout` | ✅ `popup` (indirect) | |
| GET | `/api/v1/series` | ❌ | ⏭️ | Category discovery — use Markets + scanner instead |
| GET | `/api/v1/markets` | ✅ `markets/page` | ⏭️ | |
| GET | `/api/v1/markets/{ticker}` | ✅ `markets/[ticker]` | ⏭️ | Extension uses detected ticker + backend routes |
| GET | `/api/v1/scanner/opportunities` | ✅ `scanner/page` | ⏭️ | |
| GET | `/api/v1/strategy` | ✅ via `dashboard/strategy` | ✅ | |
| GET | `/api/v1/paper/orders` | ❌ | ⏭️ | Raw ledger list; **dashboard paper-pnl** covers positions + MTM instead |
| GET | `/api/v1/dashboard/paper-positions` | ✅ `orders/paper` | ⏭️ | |
| GET | `/api/v1/paper/exit-suggestions` | ❌ | ⏭️ | Could surface on Paper & P&L later |
| GET | `/api/v1/dashboard/strategy` | ✅ multiple pages | ⏭️ | |
| GET | `/api/v1/dashboard/rules` | ✅ `dashboard`, `activity` | ⏭️ | |
| GET | `/api/v1/dashboard/rule-runs` | ✅ `dashboard`, `activity` | ⏭️ | |
| GET | `/api/v1/dashboard/analysis-recent` | ✅ `dashboard` | ⏭️ | |
| GET | `/api/v1/dashboard/paper-orders` | ⏭️ | ⏭️ | Duplicates older shape; UI uses `paper-pnl` |
| GET | `/api/v1/dashboard/paper-pnl` | ✅ `dashboard`, `orders/paper` | ⏭️ | |
| GET | `/api/v1/dashboard/jobs` | ⏭️ | ⏭️ | Could add to Settings; low priority |
| GET | `/api/v1/jobs/status` | ⏭️ | ⏭️ | Same |
| GET | `/api/v1/rules` | ✅ `rules/page` | ⏭️ | |
| GET | `/api/v1/rules/{rule_id}` | ✅ `rules/[ruleId]` | ⏭️ | |
| WS | `/api/v1/ws/ticker` | ❌ | ⏭️ | No web/extension consumer yet; `wscat` / future widget |

---

## Write / actions

| Method | Path | Web | Extension | Notes |
|--------|------|-----|-----------|--------|
| PUT | `/api/v1/strategy` | ✅ `strategy/page`, `layout` kill switch | ⏭️ | |
| POST | `/api/v1/risk/check-order` | ✅ `scanner`, `markets/[ticker]` | ✅ `popup` | |
| POST | `/api/v1/analysis/market` | ✅ `markets/[ticker]` | ✅ `popup` | |
| POST | `/api/v1/orders/place` | ❌ | ✅ `popup` | **Web gap:** intentional — paper placement from Kalshi page is extension-first; rules also create paper orders |
| POST | `/api/v1/paper/close` | ✅ `orders/paper` | ⏭️ | |
| POST | `/api/v1/jobs/run-all-enabled-once` | ✅ `dashboard` | ⏭️ | |
| POST | `/api/v1/rules` | ✅ `rules/new` | ⏭️ | |
| PUT | `/api/v1/rules/{rule_id}` | ✅ `rules/[ruleId]`, toggle on `rules/page` | ⏭️ | |
| POST | `/api/v1/rules/{rule_id}/run-once` | ✅ `rules/page` | ⏭️ | |

---

## Summary

- **Acceptable gaps:** `GET /api/v1/series` (scanner/markets substitute), `GET /api/v1/paper/orders` (superseded by paper-pnl/positions), `POST /api/v1/orders/place` on web (extension + rules cover flows), WebSocket ticker (no UI yet).
- **Possible follow-ups (not blocking v1 single-tenant):** exit-suggestions on Paper page; jobs status on Settings; optional WebSocket strip on dashboard.

**Audit date:** 2026-04-05 (update when API or UI changes).
