# KalshiBot — development roadmap

Simple plan from “nothing works” to “shippable product.” Each stage has a **short check** so you know you can move on.

---

## Stage 1 — Connect to Kalshi

**Goal:** Prove your API keys and signing work; you can read your account and markets.

**What we built:** RSA auth client, `test_connection.py`.

**How to know it passes**

- Run `python3 backend/test_connection.py` in the `backend` folder with venv on.
- You see auth success, a few sample markets, and your balance.

---

## Stage 2 — Backend API (REST shell)

**Goal:** Run a real server instead of one-off scripts.

**What we built:** FastAPI app, `/health`, `/api/v1/status`, `/api/v1/markets`, `/api/v1/markets/{ticker}`, `/api/v1/series`.

**How to know it passes**

- `GET /health` → `{"status":"ok"}`.
- `GET /api/v1/status` → `kalshi_configured: true` and balance fields.
- `GET /api/v1/markets?limit=5` returns `markets` and `cursor`.
- `GET /api/v1/markets/{ticker}` works with a ticker copied from that list.

---

## Stage 3 — Live prices (WebSocket)

**Goal:** Stream quote updates, not only one-time REST snapshots.

**What we built:** Kalshi WebSocket connect + relay `/api/v1/ws/ticker`.

**How to know it passes**

- Uvicorn running; in another terminal, `npx wscat -c ws://127.0.0.1:8000/api/v1/ws/ticker`.
- You receive JSON lines (Kalshi `ticker` messages or app heartbeats).

---

## Stage 4 — Scanner (ranked ideas)

**Goal:** Turn raw markets into a short, readable list you can act on.

**What we built:** `GET /api/v1/scanner/opportunities` using **Kalshi’s own filters**:

- `category` or `categories` → uses Kalshi `GET /series?category=...`, then `GET /markets?series_ticker=...` for each series (no guessing from titles).
- OR `series_ticker` + optional `cursor` → one series, paginated like Kalshi.

**How to know it passes**

- Call `GET /api/v1/series?category=Politics` (or another category you care about) and see a `series` array.
- Call `GET /api/v1/scanner/opportunities?category=Politics&top_n=10` and get `opportunities` with scores.
- With `series_ticker=...`, passing `cursor` from the JSON changes the next page (same as Kalshi).

**Note:** Kalshi does **not** offer `category` on `GET /markets` directly. Categories come from **`/series`**, then you filter markets by **`series_ticker`**.

---

## Stage 5 — Strategy and risk (guardrails)

**Goal:** Settings for “how much,” paper vs live later, and “block bad tickers” before trading.

**What we built:** `GET/PUT /api/v1/strategy`, `POST /api/v1/risk/check-order` (in-memory for now).

**How to know it passes**

- `GET /api/v1/strategy` returns JSON settings.
- `PUT /api/v1/strategy` changes them and you see the update on the next GET.
- `POST /api/v1/risk/check-order` returns `allowed: false` when the bot is off or limits are broken.

---

## Stage 6 — Place orders (safe path)

**Goal:** Actually send orders **only** when strategy allows, with paper/live separation.

**Implemented:** `POST /api/v1/orders/place`

**How to know it passes**

- In **paper** mode: response includes `"paper": true` and `"would_place"` and it does not call Kalshi `POST /orders`.
- In **live** mode (paper_mode=false): the endpoint refuses unless `confirm_live=true` is provided (prevents accidental real trades).

---

## Stage 7 — Save data (database)

**Goal:** Remember trades, settings, and history after restart.

**Implemented (dev):** SQLite file + tiny persistence layer.

**How to know it passes**

- `PUT /api/v1/strategy` then restart the server → `GET /api/v1/strategy` shows the same values.
- Place a paper order (`POST /api/v1/orders/place` with paper_mode=true) → response includes `paper_order_id`.
- `GET /api/v1/paper/orders` shows that order.

---

## Stage 8 — Rules engine (“if this, then trade”)

**Goal:** User-defined rules (max size, categories/series, spread/volume) drive scans and optional execution.

**Implemented:** SQLite-stored rules + `run-once` evaluator that scans scoped markets and creates **paper** orders only.

**Safety upgrade:** rules now use **safe templates** (example: `safe-liquidity`). You cannot create arbitrarily risky configs; the API validates caps (max spread, max size, max series, etc.).

**How to know it passes**

- `POST /api/v1/rules` creates a rule (returns `rule_id`).
- `GET /api/v1/rules` lists it.
- `POST /api/v1/rules/{rule_id}/run-once` returns:
  - `paper_orders_created` (>= 0)
  - an `orders` array with `allowed` flags
- Paper orders show up in `GET /api/v1/paper/orders`.
- Run a rule and confirm tickers/fields match the rule config via `backend/validation/stage8_validation.py`.

---

## Stage 9 — Jobs and scale

**Goal:** Background workers: reconnect WS, periodic scans, rate-limit safety.

**Implemented:** A rules scheduler in FastAPI `lifespan` that periodically runs enabled Stage 8 rules in **paper mode**, plus:

- `GET /api/v1/jobs/status`
- `POST /api/v1/jobs/run-all-enabled-once`

**How to know it passes**

- Leave it running hours: WS reconnects; no memory leak obvious; API stays up.
- Run `python3 backend/validation/stage9_validation.py` and confirm “Stage 9 validation PASSED”.

---

## Stage 10 — Web dashboard

**Goal:** Normal people can log in, see P&L, toggle the bot, edit rules.

**Planned:** Next.js (or similar) + auth + calls this backend.

**How to know it passes**

- You can do everything important in the UI that you currently do in Swagger.

---

## Stage 11 — Chrome extension

**Goal:** Overlay on Kalshi.com for acquisition (signals on the page you’re viewing).

**Planned:** Extension talks to your API with a signed-in session.

**How to know it passes**

- On a Kalshi market page, you see your bot’s signal or link without copying tickers by hand.

---

## Stage 12 — Accounts, billing, launch polish

**Goal:** Multi-user readiness, payments, legal/TOS alignment, monitoring.

**Planned:** Stripe tiers, structured logging, alerts, staging vs prod keys.

**How to know it passes**

- You can onboard a stranger: sign up, pay, run with their keys, and support them if something breaks.

---

### Where we are now (quick)

Stages **1–9** are implemented in code (Stages 4–8 use Kalshi taxonomy + templates + paper orders; Stage 9 adds the scheduler). Stages **10–12** are the remaining path to a full product.
