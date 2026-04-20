# Railway environment variables (KalshiBot backend)

Set these in the Railway service **Variables** tab. Redeploy after changes.

The backend reads `KALSHIBOT_DB_PATH` for SQLite; attach a **persistent volume** mounted at `/data` and use the path below so schedules and user data survive restarts.

---

## 1. Required (app will not work without these)

| Variable | Description |
|----------|-------------|
| `KALSHIBOT_USER_AUTH` | Set to `1` for multi-user SaaS mode (JWT login, encrypted per-user Kalshi keys). |
| `JWT_SECRET` | Signing key for access tokens. Generate: `python3 -c "import secrets; print(secrets.token_hex(64))"` |
| `KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY` | Fernet key for encrypting stored Kalshi credentials in SQLite. Generate: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `KALSHI_API_KEY_ID` | Kalshi API Key ID (UUID from **Account → API Keys** on Kalshi). |
| `KALSHI_PRIVATE_KEY` | **Full RSA private key in PEM form**, used for daily pick jobs and global Kalshi REST when no per-user key applies. See **Private key on Railway** below. |
| `KALSHIBOT_API_TOKEN` | Long random shared secret for admin routes (e.g. `POST /api/v1/daily-picks/generate`). |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) — daily pick + analysis enrichment. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API (no spaces). Must include your **Railway frontend URL** (e.g. `https://your-app.up.railway.app`) and, for local testing, `http://localhost:3000,http://127.0.0.1:3000`. |
| `KALSHIBOT_DB_PATH` | Use exactly **`/data/kalshibot.db`** when using a Railway volume mounted at `/data`. |

### Private key on Railway (`KALSHI_PRIVATE_KEY`)

Railway does **not** give you a stable path to upload a `.pem` file like local dev. The app supports **`KALSHI_PRIVATE_KEY`** as the raw PEM string.

1. Open your `.key` / `.pem` file locally. It should look like:
   - `-----BEGIN PRIVATE KEY-----` (or `RSA PRIVATE KEY`)
   - Several lines of base64
   - `-----END PRIVATE KEY-----`
2. In Railway **Variables**, create `KALSHI_PRIVATE_KEY`.
3. **Recommended:** paste the PEM as **one line** with **literal** `\n` where each newline was, e.g.  
   `-----BEGIN PRIVATE KEY-----\nMIIE...\n...\n-----END PRIVATE KEY-----\n`  
   Railway’s UI stores this as a string; the backend’s `normalize_private_key_pem()` converts `\n` to real newlines before loading the key.
4. **Alternative:** paste the full multi-line PEM if the Railway variable editor preserves newlines (some UIs collapse them — use the `\n` form if loading fails).
5. **Precedence:** If both `KALSHI_PRIVATE_KEY` and `KALSHI_PRIVATE_KEY_PATH` are set, **`KALSHI_PRIVATE_KEY` wins** (so production can use inline PEM only).

Do **not** commit real keys; set them only in Railway.

---

## 2. Optional but strongly recommended

| Variable | Description |
|----------|-------------|
| `NEWS_API_KEY` | [NewsAPI.org](https://newsapi.org) — headline context for analysis and daily pick (merged with RSS). |
| `FRED_API_KEY` | [FRED](https://fred.stlouisfed.org/docs/api/api_key.html) — macro snapshot for Economics/Financials daily picks. |
| `STRIPE_SECRET_KEY` | Stripe dashboard — billing checkout and portal. |
| `STRIPE_PRICE_ID` | Stripe **Price** ID for Pro subscription. |
| `STRIPE_WEBHOOK_SECRET` | For `POST /api/v1/billing/webhook` signature verification. |
| `PUBLIC_APP_URL` | Public **frontend** base URL (e.g. `https://your-frontend.up.railway.app`) for Stripe return URLs. |
| `RESEND_API_KEY` | Password reset / email (if you use Resend). |
| `EMAIL_FROM` | From address for Resend. |

Other optional knobs (see `backend/.env.example`): `KALSHI_API_BASE` (demo API), `DAILY_PICK_*`, `KALSHIBOT_API_TOKEN`-related behavior, etc.

---

## Health check

The app exposes **`GET /health`** returning `{"status":"ok"}` with no auth.

In Railway: open the service **Settings → Healthcheck** (or equivalent) and set the path to **`/health`**. Use the same public URL/port the platform assigns to the web process.

---

## Deploy root directory

In Railway, set the service **root directory** to **`backend`** (the folder that contains `Procfile`, `requirements.txt`, and `app/`). The start command runs `uvicorn app.main:app` from that directory.

---

## Persistent volume

1. Add a **volume** to the backend service, mount path **`/data`**.
2. Set `KALSHIBOT_DB_PATH=/data/kalshibot.db`.
3. First boot will create the database on the volume; schedulers and user data persist across deploys.
