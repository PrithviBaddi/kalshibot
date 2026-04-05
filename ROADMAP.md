# KalshiBot — roadmap

This file is the **single source of truth** for what exists, what’s next, and when the product is “done.”  
**Rule:** If we ship code that isn’t listed here, we **update this roadmap in the same change** so progress stays visible.

---

## How to read this doc

| Section | Meaning |
|--------|---------|
| **Stages 1–9** | Early milestones — **done** in code unless noted. |
| **Stage 10–12** | Stages 10–12 **done** (Stage 12 = optional multi-tenant mode; see checklist). |
| **Addenda** | Work that shipped **outside** the original stage names (analysis, optional API lock, etc.). |
| **Path to v1.0** | **Ordered checklist** — work through top to bottom; you can tick items off as you go. |

---

## Stages 1–9 (foundation) — complete

| Stage | Topic | Status |
|-------|--------|--------|
| 1 | Kalshi RSA + `test_connection.py` | Done |
| 2 | FastAPI REST shell | Done |
| 3 | WebSocket relay `/api/v1/ws/ticker` | Done |
| 4 | Scanner `GET /api/v1/scanner/opportunities` | Done |
| 5 | Strategy + risk check | Done |
| 6 | Orders (paper + guarded live) | Done |
| 7 | SQLite persistence | Done |
| 8 | Rules engine + templates | Done |
| 9 | Scheduler + jobs | Done |

Details and pass/fail checks for each are in the sections below (unchanged from the original plan).

<details>
<summary>Stages 1–9 — original criteria (click to expand)</summary>

### Stage 1 — Connect to Kalshi
**Check:** `python3 backend/test_connection.py` → auth success, sample markets, balance.

### Stage 2 — Backend API
**Check:** `/health`, `/api/v1/status`, `/api/v1/markets`, `/api/v1/markets/{ticker}`, `/api/v1/series`.

### Stage 3 — Live prices (WebSocket)
**Check:** `npx wscat -c ws://127.0.0.1:8000/api/v1/ws/ticker` receives messages. If `KALSHIBOT_API_TOKEN` is set, use `?token=...` (see Addendum A).

### Stage 4 — Scanner
**Check:** `/api/v1/scanner/opportunities?category=...&top_n=...` returns ranked `opportunities`.

### Stage 5 — Strategy and risk
**Check:** `GET/PUT /api/v1/strategy`, `POST /api/v1/risk/check-order`.

### Stage 6 — Place orders
**Check:** Paper mode does not hit Kalshi live orders; live requires `confirm_live`.

### Stage 7 — Database
**Check:** Strategy and paper orders survive server restart.

### Stage 8 — Rules
**Check:** Create rule, `run-once`, paper orders created with validation.

### Stage 9 — Jobs
**Check:** Scheduler runs; `GET /api/v1/jobs/status`; `stage9_validation.py` passes.

</details>

---

## Addenda (not in original stage numbers)

### Addendum A — Optional API token (deployment lock)

**Goal:** When you deploy the backend publicly, optionally require `Authorization: Bearer …` so strangers cannot call your API.

**Status:** Implemented.

**Default UX:** If `KALSHIBOT_API_TOKEN` is **not** set, behavior is unchanged (good for first-time local use).

**Where configured:** `backend/.env` → `KALSHIBOT_API_TOKEN`. Frontend: `NEXT_PUBLIC_API_TOKEN` in `frontend/.env.local`. Extension: **Chrome extension “Options” / Settings** (not the main popup) for API URL + token — keeps the popup simple.

**Roadmap rule:** This is **not** a substitute for real user accounts; it’s a **deployment hardening** step before Stage 12–style auth.

---

### Addendum B — Market analysis stack (“12A–C” in code comments)

| Piece | What it does | Status |
|-------|----------------|--------|
| 12A | Baseline analysis: order-book mid, liquidity confidence | Done |
| 12B | Optional Claude enrichment (`ANTHROPIC_API_KEY`) | Done |
| 12C | Optional NewsAPI headlines (`NEWS_API_KEY`) | Done |
| — | Persist analysis snapshots in SQLite + dashboard “Recent analysis” | Done |
| — | Market detail page “Run analysis” | Done |
| — | Scanner → “Analyze” link to market page | Done |
| — | Correct Kalshi.com links (`/events/…`, series slug) | Done |

---

## Stage 10 — Web dashboard

**Original goal:** Normal people can use the product in a browser without Swagger.

**Status:** **Complete** for the web app: parity audit, first-visit / zero-data empty states, and `formatApiError` + `ApiErrorBanner` / `KalshiConnectionHint` across main routes.

**Remaining for Stage 10 “complete”**

- [x] **Parity audit:** See [`docs/STAGE10_PARITY.md`](docs/STAGE10_PARITY.md) (API route ↔ web ↔ extension; gaps labeled).
- [x] **Empty states:** First visit hints (connect Kalshi, run scanner, etc.) where still generic.
- [x] **Errors:** Consistent handling when Kalshi or backend returns 4xx/5xx (user-facing message, not raw JSON).

---

## Stage 11 — Chrome extension

**Original goal:** Signals on Kalshi.com without copying tickers.

**Status:** **Complete** for the shipped extension: popup detects markets, shows **Analysis** (same voice as the web app), risk + paper place, and **Settings** for API URL/token when needed.

**Remaining for Stage 11 “complete”**

- [x] **Host permissions:** `manifest.json` includes `optional_host_permissions: ["<all_urls>"]`; **Extension options → Save** calls `chrome.permissions.request` for your API origin (see [`DEPLOY.md`](DEPLOY.md) §7). Alternative: add a fixed `https://api.yourdomain.com/*` under `host_permissions` and reload.
- [x] **Analysis UX:** Copy aligned with web — section title **Analysis**, subtitle “Live Kalshi quote + optional Claude”, loading “Fetching market snapshot and model…”, shared source-line wording, dashboard **Recent analysis**.
- [x] **Optional:** JWT sessions with backend (Stage 12) — extension can adopt the same Bearer token pattern later.

---

## Stage 12 — Accounts, billing, launch

**Goal:** Strangers can sign up, pay, plug in keys, run safely.

**Status:** **Shipped (optional mode).** Enable with `KALSHIBOT_USER_AUTH=1` + `JWT_SECRET` + `KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY` — see [`DEPLOY.md`](DEPLOY.md). Default / legacy installs stay single-tenant (env Kalshi + optional shared API token).

**Delivered**

1. **Auth:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `PUT /api/v1/auth/kalshi-credentials` (encrypted PEM + key id in SQLite).
2. **Data isolation:** `user_id` on strategy, rules, paper ledger, analysis snapshots, rule runs.
3. **Stripe:** `POST /api/v1/billing/checkout-session`, `POST /api/v1/billing/webhook` (subscription → `plan` / `subscription_status` on `users`).
4. **Legal (web):** `/legal/terms`, `/legal/privacy` (template copy — replace before a public launch).
5. **Ops:** Structured console logging via `logging.basicConfig` in the API process.

**Still on you for production:** Stripe Dashboard (products/prices/webhook URL), counsel-approved Terms/Privacy, monitoring/alerts/rate limits (see Phase 3).

---

## Path to v1.0 — follow in order

Use this as the **master checklist**. Order matters: later items often depend on earlier ones.

### Phase 1 — Lock what you have (single deployable product)

- [x] Core trading + paper + rules + scheduler (Stages 1–9)
- [x] Web dashboard + extension (minimal but real)
- [x] Analysis + optional Claude/news + history
- [x] Optional API token for public backend + simple extension/web config
- [x] **Deploy recipe:** [`DEPLOY.md`](DEPLOY.md) — env vars, systemd sketch, HTTPS, CORS, extension
- [x] **Stage 10 parity audit:** [`docs/STAGE10_PARITY.md`](docs/STAGE10_PARITY.md)
- [x] **Stage 11 host permissions:** runtime grant + docs (`DEPLOY.md` §7); manual testing on your deploy is on you
- [x] **Stage 11 analysis UX:** Extension labels and analysis copy match the web app (see Stage 11 checklist).

**Phase 1 done when:** A friend can hit your deployed URL, use the web app and the extension (after approving the API host in extension options), without you SSH’ing to debug.

---

### Phase 2 — Real customers (multi-tenant)

- [x] User accounts + per-user Kalshi API credentials stored safely (when `KALSHIBOT_USER_AUTH=1`)
- [x] Stripe Checkout + webhook hooks (configure `STRIPE_*` env vars; enforce plan limits in product logic as needed)
- [x] JWT replaces reliance on shared token for logged-in users (`NEXT_PUBLIC_USER_AUTH=1`); optional shared `KALSHIBOT_API_TOKEN` still works for admin/scripts

**Phase 2 done when:** Someone you don’t know can pay, connect keys, and run without your intervention.

---

### Phase 3 — Launch quality

- [ ] Monitoring, on-call alerts, backup strategy for DB
- [ ] Rate limits abuse protection on expensive endpoints (analysis, etc.)
- [ ] Public docs / support path

**Phase 3 done when:** You’re willing to post the link on the internet and sleep.

---

## Where we are now (one line)

**Deploy recipe + Stage 12 optional multi-tenant mode + extension + Stage 10–11 polish are in place; battle-test your deploy, tighten Stripe/legal/monitoring before a wide launch.**

When in doubt, advance **Phase 1** until the checklist is green before building Phase 2.
