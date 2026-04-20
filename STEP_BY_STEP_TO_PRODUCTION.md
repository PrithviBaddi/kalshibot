# Step-by-step to production (checklist)

Use this as your **ordered** list. Check `[ ]` → `[x]` as you finish.  
Stages are **in order** unless a note says you can parallelize.

**Read first:** [`docs/PRODUCT_MODEL.md`](docs/PRODUCT_MODEL.md) — **Free vs Pro** definition, what the code must become, and **legal** limits on marketing claims.

**Honest line:** Software cannot **guarantee** profit or “perfect” trades. This checklist gets you to **shippable SaaS** + a **daily pick (Free)** + **full bot (Pro)** you then **improve** with data.

---

## Part 0 — Lock how the product is shaped

**1.** [x] **One site only** — single Next.js app (marketing + app on one domain). *You decided this.*

**2.** [x] **Free tier (locked definition):** Sign up only. **No** dashboard, **no** paper trades, **no** bot automation, **no** Kalshi connection. Users only get **one shared “daily pick”** per day (server-generated; same pick for all free users unless you later split by region). Optional: auto-post that pick to **Twitter/X** for marketing.

**3.** [x] **Pro tier (~$49/mo to start):** Full app — **paper mode**, **Kalshi connect**, **scanner/rules**, **automation** toward hands-off trading. Price can go up later (new Stripe Price when you change it).

**4.** [x] **Write pricing page draft** that matches 2–3 and includes **risk disclaimers** (not financial advice, can lose money — lawyer to finalize).

---

## Part 1 — Things you buy or register (no code)

**5.** [ ] Buy a **domain**.

**6.** [ ] Create a **Stripe** account; finish their questions.

**7.** [ ] **Anthropic** account + API key (for Claude).

**8.** [ ] **NewsAPI** (or other news source) + key.

**9.** [ ] **Resend** (or other) for email.

**10.** [ ] (Optional) **Twitter/X API** if you auto-post the daily pick.

---

## Part 2 — Your computer runs the project

**11.** [x] Clone repo; install **Python** backend deps.

**12.** [x] Install **Node** frontend deps.

**13.** [x] `backend/.env` from `.env.example` (fill keys as you get them).

**14.** [x] `frontend/.env.local` with `NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000` for local dev.

**15.** [x] API starts (`uvicorn`) with no crash.

**16.** [x] Frontend starts (`npm run dev`); browser loads.

---

## Part 3 — Build **Free** tier product (do this before polishing full dashboard for everyone)

**17.** [x] **DB + API:** Table (or equivalent) for **one global daily recommendation** (date, ticker, title, summary, confidence, JSON blob, `created_at`).

**18.** [x] **Admin or script:** Way to **generate** today’s row (manual button OK for v1) calling **one** Claude (+ news) pipeline that picks **one** market — **not** per-user unlimited calls.

**19.** [x] **GET endpoint** for logged-in users: returns **today’s** pick (404 or empty state if not generated yet).

**20.** [x] **Frontend:** Page e.g. `/daily` or `/pick` — **only** thing Free users need after login (see step 23).

**21.** [x] **Route guard:** If `plan` is **free**, **block** `/dashboard`, `/scanner`, `/rules`, `/markets`, paper, settings/Kalshi — redirect to daily pick or pricing.

**22.** [x] **Register flow:** After signup, Free users land on **daily pick** page, **not** full dashboard.

**23.** [ ] **Test:** Two free accounts see the **same** pick for the same day.

**24.** [ ] (Optional) **Cron** on server: generate pick every day at fixed time (UTC).

**25.** [ ] (Optional) **Twitter:** Post the same text/image you show on `/daily`.

---

## Part 4 — **Pro** tier: Kalshi + paper + existing bot (full app)

*Skip heavy testing here until Part 3 guards exist, or use a **Pro** test account only.*

**26.** [ ] **Pro test user** (Stripe test subscription or manual `plan=pro` in DB for dev).

**27.** [ ] Kalshi **API Key ID** + **PEM** from Kalshi’s site.

**28.** [ ] Pro user: **connect Kalshi** in app; **status** shows connected; **balance** loads.

**29.** [ ] **Paper mode ON**; confirm no real orders until you turn paper off.

**30.** [ ] **Scanner** works for Pro user.

**31.** [ ] **One rule** created; **run once**; **paper orders** appear.

**32.** [ ] Understand **scheduler**: how often rules run in prod.

---

## Part 5 — Claude + News (quality, not magic)

**33.** [ ] `ANTHROPIC_API_KEY` set; **daily pick** pipeline uses Claude (and/or Pro-only flows).

**34.** [ ] `NEWS_API_KEY` set; headlines feed into the prompts you care about.

**35.** [ ] **Tune prompts** for **daily pick** (short, structured, no fake certainty) and separately for **Pro deep analysis** if different.

**36.** [ ] **Log** failures and costs per run so you know burn rate.

**37.** [ ] Accept: models **err**; size and **risk limits** are mandatory for real money.

---

## Part 6 — Multi-user auth (if not already)

**38.** [ ] `KALSHIBOT_USER_AUTH=1`, `JWT_SECRET`, `KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY` on backend.

**39.** [ ] `NEXT_PUBLIC_USER_AUTH=1` on frontend.

**40.** [ ] Two accounts **isolated** (A cannot see B’s data).

---

## Part 7 — Stripe (test first)

**41.** [ ] Stripe **Test** Product + recurring Price ~**$49**; `STRIPE_PRICE_ID` in `.env`.

**42.** [ ] `STRIPE_SECRET_KEY` (test) + `PUBLIC_APP_URL` for redirects.

**43.** [ ] Pricing page → Checkout → return **without** crash.

**44.** [ ] Webhook (CLI or ngrok) → user becomes **pro** in DB.

**45.** [ ] Cancel sub → user back to **free** → **blocked** from Pro routes again.

---

## Part 8 — Tier rules = what you wrote in Part 0

**46.** [ ] **Code + env** match: Free = daily pick only; Pro = full routes + Kalshi + paper + bot.

**47.** [ ] **curl / browser:** Free JWT **cannot** open Pro-only API routes (403/402/404 as you choose).

**48.** [ ] **Pricing page** matches reality.

---

## Part 9 — Frontend: business shell (one site)

**49.** [ ] **Home** explains product + CTA signup.

**50.** [ ] **Pricing** Free vs Pro + disclaimers.

**51.** [ ] Login / register / forgot password.

**52.** [ ] Footer: Terms, Privacy, contact.

**53.** [ ] **Mobile width** usable.

---

## Part 10 — Email

**54.** [ ] Resend (or other) on server; **password reset** email works.

**55.** [ ] (Later) Email verify on signup.

---

## Part 11 — Deploy API

**56.** [ ] Host + DNS `api.yourdomain.com` + HTTPS.

**57.** [ ] Prod `.env`; **persistent** `KALSHIBOT_DB_PATH`; **CORS** = your frontend only.

**58.** [ ] `/health` OK from internet.

---

## Part 12 — Deploy frontend

**59.** [ ] `npm run build` OK.

**60.** [ ] Host frontend; `NEXT_PUBLIC_API_BASE` = prod API.

**61.** [ ] Apex + `www` HTTPS; **no CORS errors** in browser.

---

## Part 13 — Production Stripe

**62.** [ ] Live keys + live Price when ready.

**63.** [ ] Webhook URL on prod API + `STRIPE_WEBHOOK_SECRET`.

**64.** [ ] Small real payment test + refund if needed.

---

## Part 14 — Security & ops

**65.** [ ] Rate limits on auth + expensive routes (or Cloudflare).

**66.** [ ] SQLite **backups** + one **restore** test.

**67.** [ ] Uptime check on `/health`.

**68.** [ ] Error logging (e.g. Sentry) recommended.

**69.** [ ] Short **runbook** (API down, webhook fails, DB).

---

## Part 15 — Extension (optional)

**70.** [ ] Extension points to prod API; Pro user smoke test.

---

## Part 16 — Legal

**71.** [ ] Lawyer-reviewed **Terms** + **Privacy** before big spend on ads.

**72.** [ ] **Risk** language on site and checkout (not investment advice; can lose money).

**73.** [ ] Cookie banner if you use analytics pixels.

---

## Part 17 — Launch

**74.** [ ] Staging with Stripe test end-to-end.

**75.** [ ] Private beta (5–20 people).

**76.** [ ] Soft launch → monitor daily.

**77.** [ ] Public launch when stable.

---

## Part 18 — Pro bot: make it **better** over time (not one checkbox)

**78.** [ ] **Position sizing** tied to user **risk** settings and balance (document rules in code comments).

**79.** [ ] **Scheduled re-check** of open positions with news + model (even if v1 is “alert only” before auto-sell).

**80.** [ ] **Paper P&amp;L** dashboard honesty: show drawdowns, not only wins.

**81.** [ ] Add **other data feeds** (legal, affordable) as needed.

**82.** [ ] **Review weekly:** bad trades → prompt and rule changes.

**83.** [ ] **Never** ship copy that **guarantees** returns without lawyer approval.

---

## Quick map

| Stuck on… | Go to… |
|-----------|--------|
| What Free vs Pro means | `docs/PRODUCT_MODEL.md` + Part 0, 3, 8 |
| Daily pick not built | Part 3 |
| Full bot / Kalshi | Part 4 |
| Money / subscriptions | Parts 7, 13 |
| Live on internet | Parts 11–12 |

---

**About 83 checklist lines.** Part **18** is ongoing product work, not “done once.”
