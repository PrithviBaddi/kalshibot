# Product model — how KalshiBot is supposed to work

This doc matches **your** direction. The **code does not all exist yet**; use this with `STEP_BY_STEP_TO_PRODUCTION.md` to know what to build next.

---

## 1) One website (locked)

- **Single Next.js app** on one domain.
- Public pages: home, pricing, legal, maybe blog.
- Logged-in **Free** users see a **small** experience (daily pick).
- Logged-in **Pro** users see the **full** app (dashboard, scanner, rules, Kalshi, automation).

---

## 2) Free tier — what users get

**Goal:** Tease value + marketing; **do not** give unlimited Claude “deep research” for free.

| Free user can | Free user cannot |
|----------------|------------------|
| Sign up / log in | Use full **dashboard** as the main product |
| See **one shared “daily pick”** per day (same recommendation for every free user, or same per region if you add that later) | Connect **Kalshi** or see balances in your app |
| Maybe share that pick on **Twitter/X** (you post it for marketing) | **Paper trading** |
| | **Rules** / **scanner** / **automated bot** |
| | Run **per-market** Claude analysis on demand (that burns API $ and is your paid value) |

**How the daily pick is made (target behavior):**

1. On a **schedule** (e.g. once per day UTC), the **server** runs **one** pipeline (not one full Claude session per free user).
2. That pipeline can use **Claude + NewsAPI + anything else you add** (RSS, Kalshi public data, other APIs) to choose **one** market and output a **short, structured** recommendation: thesis, implied odds vs model, confidence, risks.
3. Store the result in the DB; every free user reads **the same** row for “today.”

**Important:** Marketing lines like “highly profitable” or “goal for profit” must be framed as **opinion / education**, not a **promise** of returns (see section 6).

---

## 3) Pro tier — what users pay for (~$49/mo to start)

**Price:** Start around **$49/month**; you can raise it as the product proves itself — but **Stripe** needs a Price change or new Price ID when you do.

| Pro user can | Notes |
|--------------|--------|
| **Paper mode** | Test strategies without real money |
| **Connect Kalshi** | Encrypted keys; trades go to **their** Kalshi account |
| **Full automation** (goal) | Rules + scheduler + (over time) Claude-assisted **hold/sell** and **sizing** — this is **hard engineering** and must respect Kalshi API limits and risk |
| **Scanner, rules, dashboard** | Everything that is “the real bot” today + what you add |

**What “perfect bot” means in software terms (honest):**

- Find **liquid, understandable** markets; avoid reckless size.
- **Size** orders using **your** risk settings (max per trade, max daily loss, etc.).
- **Re-check** positions on a schedule with **news + model** input; suggest or execute **exit** when rules say so (you must define who decides: fixed rules vs Claude vs both).
- **No code** can guarantee the account “always goes up” or “$1 → $50 in a month.” That is **market risk**. The product is **tools + automation**, not a guaranteed investment.

**Other APIs:** You can add any **legal** data source (macro feeds, sports odds APIs, SEC filings, etc.) behind the Pro pipeline as long as you respect **terms of service** and **cost**.

---

## 4) What the repo does today vs this model

**Today (roughly):** Free and Pro both hit much of the same app; quotas on analysis/scanner/jobs; Claude enriches **per** analysis call.

**Target:** **Split experiences** — Free = **daily pick page only**; Pro = **current full app** + later **stronger** automation and prompts.

**You will need to build (high level):**

1. **Routing / auth guards** so Free accounts **cannot** open dashboard routes.
2. **`daily_pick` (or similar) table** + **GET** API for “today’s pick.”
3. **Daily job** that produces that pick (Claude + news + scanner subset).
4. **Pro gate** on all “expensive” routes (already partly there; must match **new** Free definition).
5. **Pro bot v2:** portfolio-level prompts, rebalancing logic, exit logic — **iterative**; not one PR.

---

## 5) Build order (simple)

1. **Lock** this doc + pricing copy (with disclaimers).
2. **Implement Free wall** + **daily pick** page + **batch** Claude job (protect your API spend).
3. **Keep improving Pro bot** (paper → small live → more automation) with **logging** and **paper P&amp;L** truth.
4. **Stripe** already wired: Pro = unlock full app.
5. **Marketing** (Twitter daily pick, landing page) after (2) is stable.

---

## 6) Marketing, law, and what you must not promise

- In the US and elsewhere, **guaranteed returns**, “passive income for doing nothing,” or “turn $1 into $50 in a month” can be **illegal** or **misleading** unless you have the right **licenses** and **disclosures**. Treat those phrases as **aspirational pitch** only until a **lawyer** approves public copy.
- **Not financial advice:** Software assists **self-directed** traders; users accept **loss of principal**.
- **Kalshi** has its own **rules**; your bot must **comply** with exchange and API terms.

Put real **Terms**, **Privacy**, and **risk disclosures** in place **before** you scale ads or paid acquisition.

---

## 7) Twitter / X daily post (optional)

- Use the **same** `daily_pick` object the app shows.
- One post per day = low spam risk; still follow **X** API rules and your lawyer’s guidance on **promotional** content.

---

*Last aligned with product direction: single site, Free = daily pick only, Pro = full bot + Kalshi automation (evolving).*
