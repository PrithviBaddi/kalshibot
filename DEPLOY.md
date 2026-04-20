# KalshiBot — deploy recipe

Single-tenant deployment: **FastAPI backend** + **Next.js frontend** + optional **Chrome extension**. Adjust hostnames and paths to match your environment.

### “Real host” and “public API URL” (plain English)

- **Local only:** `http://127.0.0.1:8000` or `http://localhost:8000` runs on **your computer**. Only you (and sometimes the extension, with special permissions) can use it. There is **no** public API URL until you deploy.
- **A real / production host:** A **machine or service on the internet** (VPS, Railway, Fly.io, AWS, etc.) where you install and run the same FastAPI app so it stays up and has a **public DNS name**.
- **Your public API URL:** Whatever **HTTPS base URL** you assign to that deployment — e.g. `https://api.yourdomain.com` or `https://your-service.up.railway.app`. You **choose** it when you set up DNS or use the hostname your provider gives you; it is not hidden inside Kalshi or this repo.

Until you complete that step, skip “public URL” checklists and keep using localhost for development.

**No domain or cloud host yet?** Skip this deploy guide for now. Use `http://127.0.0.1:8000` (API) and `http://localhost:3000` (Next) locally; come back here when you’re ready to expose the API on the internet.

---

## 1. What runs where

| Piece | Role | Typical bind |
|-------|------|----------------|
| **Backend** | REST + WebSocket + SQLite + scheduler | `0.0.0.0:8000` behind HTTPS reverse proxy |
| **Frontend** | Next.js UI | `3000` (dev) or static/`next start` behind same or separate host |
| **Extension** | Calls your **public** API URL from `kalshi.com` pages | User sets API base in **Extension options** |

---

## 2. Backend environment (`backend/.env`)

Copy from `backend/.env.example` and set at least:

| Variable | Required | Purpose |
|----------|----------|---------|
| `KALSHI_API_KEY_ID` | Yes (for trading/quotes) | Kalshi API key UUID |
| `KALSHI_PRIVATE_KEY_PATH` or inline key | Yes | RSA private key for signing |
| `KALSHIBOT_DB_PATH` | Optional | SQLite file path (default: `backend/kalshibot.db`). **Set an absolute path in production** so the DB is not lost on cwd changes. |
| `CORS_ORIGINS` | **Yes for browser UI** | Comma-separated origins allowed to call the API, e.g. `https://app.yourdomain.com` |
| `KALSHIBOT_API_TOKEN` | Optional | If set, all routes except `/health`, `/api/v1/status`, and OpenAPI docs require `Authorization: Bearer <token>` |
| `ANTHROPIC_API_KEY` | Optional | Claude analysis |
| `NEWS_API_KEY` | Optional | News headlines in analysis |

**WebSocket note:** If `KALSHIBOT_API_TOKEN` is set, clients must use  
`wss://your-api/api/v1/ws/ticker?token=<same>` (browsers cannot send `Authorization` on WebSocket).

---

## 3. CORS

The app adds `http://localhost:3000` and `http://127.0.0.1:3000` by default. For production:

```bash
export CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com
```

Redeploy the backend after changing this.

---

## 4. Run the API (production-style)

### Option A — Uvicorn directly

```bash
cd backend
# use a venv with dependencies installed
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

### Option B — Systemd (sketch)

`/etc/systemd/system/kalshibot.service`:

```ini
[Unit]
Description=KalshiBot API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/kalshibot/backend
EnvironmentFile=/opt/kalshibot/backend/.env
ExecStart=/opt/kalshibot/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then: `sudo systemctl daemon-reload && sudo systemctl enable --now kalshibot`

---

## 5. HTTPS reverse proxy

**Do not** expose raw `:8000` on the public internet without TLS. Put **Caddy** or **nginx** in front:

**Caddy** example (`Caddyfile`):

```text
api.yourdomain.com {
    reverse_proxy 127.0.0.1:8000
}
```

Ensure `CORS_ORIGINS` includes the **frontend** origin (`https://app.yourdomain.com`), not only the API host.

---

## 6. Frontend (`frontend/`)

Build-time env (e.g. `.env.production` or host env):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE` | **HTTPS** URL of the FastAPI API, e.g. `https://api.yourdomain.com` |
| `NEXT_PUBLIC_API_TOKEN` | Same value as `KALSHIBOT_API_TOKEN` **only if** you enabled API token on the server |
| `NEXT_PUBLIC_USER_AUTH` | Set to `1` when the API runs with `KALSHIBOT_USER_AUTH=1` (JWT login; see Stage 12 below) |

### Stage 12 — multi-tenant mode (optional)

Enable when you want **accounts**, **encrypted per-user Kalshi keys**, and optional **Stripe** billing (instead of a single shared API token + env Kalshi keys).

**Backend env (add to `backend/.env`):**

| Variable | Purpose |
|----------|---------|
| `KALSHIBOT_USER_AUTH=1` | Turn on JWT auth + per-user SQLite rows (`user_id` on rules, paper, analysis, etc.) |
| `JWT_SECRET` | Signing key for access tokens (long random string) |
| `KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY` | **Server** Fernet key (one generated line) for encrypting per-user Kalshi material in SQLite — **not** your Kalshi API Key ID or private key. Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Optional — subscription Checkout + webhook (`POST /api/v1/billing/webhook`) |
| `PUBLIC_APP_URL` | Your Next.js origin for Stripe success/cancel redirects and Customer Portal `return_url` |
| `FREE_TIER_ANALYSIS_PER_DAY` | Optional (default `25`) — per-user UTC-day cap on successful market analyses when not on Pro |
| `FREE_TIER_NEWS` | Optional (`1` or `0`, default `1`) — whether free tier may include news in analysis when `NEWS_API_KEY` is set |
| `FREE_TIER_SCANNER_PER_DAY` | Optional (default `40`) — per-user UTC-day cap on `GET /api/v1/scanner/opportunities` when not on Pro |
| `FREE_TIER_JOB_RUNS_PER_DAY` | Optional (default `30`) — manual rule runs (`POST .../run-once`, `POST .../run-all-enabled-once`) per UTC day on Free |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional — transactional email (e.g. password reset). Without them, reset links may only appear in server logs |

**Frontend:** `NEXT_PUBLIC_USER_AUTH=1` so the UI shows login/register and the Settings form for Kalshi keys.

**Legacy:** Omit `KALSHIBOT_USER_AUTH` — behavior stays **single-tenant** (env Kalshi keys + optional `KALSHIBOT_API_TOKEN`).

**Chrome extension:** The popup sends `Authorization: Bearer <apiToken from options>`. In multi-user mode you can paste a **JWT** from login into the same field (or keep a shared `KALSHIBOT_API_TOKEN` for a bot account).

```bash
cd frontend
npm ci
npm run build
npm run start
# or: next export / static hosting — follow Next.js docs for your host
```

---

## 7. Chrome extension (production API)

1. Load unpacked from `extension/` (dev) or pack for distribution.
2. **Extension options** → set **API base URL** to `https://api.yourdomain.com` (no trailing slash path).
3. On **Save**, Chrome prompts to **allow access** to that host — accept so the popup can `fetch` your API.
4. If you prefer not to use runtime permission, you can add a fixed line to `manifest.json`:

```json
"host_permissions": [
  "http://127.0.0.1:8000/*",
  "http://localhost:8000/*",
  "https://api.yourdomain.com/*"
]
```

Then reload the extension. The repo also declares `optional_host_permissions` so users can approve **any** HTTPS API URL without editing the manifest (see `extension/manifest.json`).

---

## 8. Smoke checks after deploy

1. `GET https://api.yourdomain.com/health` → `{"status":"ok"}`
2. `GET https://api.yourdomain.com/api/v1/status` → `kalshi_configured`, `auth_required`
3. Open the Next app → dashboard loads without CORS errors in the browser console
4. Extension on a Kalshi market page → bot status / analysis load (check options URL + permission)

---

## 9. Related docs

- **API ↔ UI coverage:** [`docs/STAGE10_PARITY.md`](docs/STAGE10_PARITY.md)
- **Product roadmap:** [`ROADMAP.md`](ROADMAP.md)
