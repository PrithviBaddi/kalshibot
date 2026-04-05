const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000'

/** Public for error messages and diagnostics */
export function getApiBaseUrl(): string {
  return BASE
}

/** Same secret as backend KALSHIBOT_API_TOKEN (embedded in client bundle — use only for self-hosted / trusted setups). */
const API_TOKEN = (process.env.NEXT_PUBLIC_API_TOKEN ?? '').trim()

const USER_AUTH = (process.env.NEXT_PUBLIC_USER_AUTH ?? '').trim() === '1'

/** Stage 12: backend has KALSHIBOT_USER_AUTH=1 — use login + JWT instead of shared API token. */
export function isUserAuthMode(): boolean {
  return USER_AUTH
}

const JWT_KEY = 'kalshibot_jwt'

export function getAccessToken(): string {
  if (typeof window === 'undefined') return ''
  return (localStorage.getItem(JWT_KEY) ?? '').trim()
}

export function setAccessToken(token: string | null): void {
  if (typeof window === 'undefined') return
  if (token) localStorage.setItem(JWT_KEY, token)
  else localStorage.removeItem(JWT_KEY)
}

/** True if the Next.js app was built with NEXT_PUBLIC_API_TOKEN (matches server KALSHIBOT_API_TOKEN). */
export function hasClientApiToken(): boolean {
  return API_TOKEN.length > 0
}

function authHeaders(): Record<string, string> {
  const jwt = getAccessToken()
  if (jwt) return { Authorization: `Bearer ${jwt}` }
  if (API_TOKEN) return { Authorization: `Bearer ${API_TOKEN}` }
  return {}
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${txt}`)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => req<T>('GET', path),
  post: <T>(path: string, body?: unknown) => req<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => req<T>('PUT', path, body),
}

/** Best-effort parse of FastAPI `{"detail": "..."}` and browser network errors */
export function formatApiError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const raw = err.message
  if (/failed to fetch|networkerror|load failed|network request failed|fetch.*cancel/i.test(raw)) {
    return `Can’t reach the API at ${BASE}. Start the backend (e.g. uvicorn on port 8000) or set NEXT_PUBLIC_API_BASE in .env.local.`
  }
  const m = raw.match(/^(\d{3}):\s*([\s\S]+)$/)
  if (!m) return raw
  const code = m[1]
  const body = m[2]?.trim()
  if (!body?.startsWith('{')) {
    let out = `${code}: ${body}`
    if (code === '401' && /Unauthorized|missing|invalid.*token|authentication required/i.test(body)) {
      out += isUserAuthMode()
        ? ' Sign in again (session may have expired).'
        : ' If the server uses KALSHIBOT_API_TOKEN, set NEXT_PUBLIC_API_TOKEN to match.'
    }
    return out
  }
  try {
    const j = JSON.parse(body) as { detail?: unknown }
    const d = j.detail
    if (typeof d === 'string') {
      let out = `${code}: ${d}`
      if (code === '401') out += ' (Check API token if your backend requires one.)'
      return out
    }
    if (Array.isArray(d) && d[0] && typeof d[0] === 'object' && d[0] !== null && 'msg' in d[0]) {
      return `${code}: ${String((d[0] as { msg?: string }).msg)}`
    }
  } catch {
    /* ignore */
  }
  return raw
}

// --- Types ---

export interface HealthResponse { status: string }

export interface StatusResponse {
  kalshi_configured: boolean
  /** True when server has KALSHIBOT_API_TOKEN set — clients must send Authorization bearer. */
  auth_required?: boolean
  balance?: number
  balance_dollars?: string
  error?: string
  ticker_hub_running?: boolean
}

export interface Market {
  ticker: string
  title: string
  /** Use with `kalshiPublicUrl()` — Kalshi’s site uses this for /events/…, not the contract ticker path. */
  event_ticker?: string
  series_ticker?: string
  yes_bid?: number
  yes_ask?: number
  yes_bid_dollars?: string
  yes_ask_dollars?: string
  volume?: number
  volume_fp?: string
  open_interest?: number
  status?: string
  close_time?: string
  category?: string
  subtitle?: string
}

export interface MarketsResponse {
  markets: Market[]
  cursor?: string
}

export interface Series {
  ticker: string
  title: string
  category?: string
  tags?: string[]
}

export interface SeriesResponse { series: Series[] }

export interface Opportunity {
  ticker: string
  title: string
  yes_bid: number
  yes_ask: number
  mid_prob: number
  spread: number
  volume: number
  open_interest: number
  score: number
  series_ticker?: string
  close_time?: string
}

export interface OpportunitiesResponse {
  opportunities: Opportunity[]
  scanned_count: number
  filters: Record<string, unknown>
  cursor?: string
}

export interface Strategy {
  bot_enabled: boolean
  paper_mode: boolean
  max_position_cents: number
  daily_loss_limit_cents: number
  min_volume: number
  max_spread: number
  notes: string
  blocked_keywords: string[]
  /** Paper-only: auto-close at mid when TP/SL vs entry is hit */
  auto_exit_paper: boolean
  /** Per-contract unrealized gain (cents) to trigger auto sell */
  paper_take_profit_cents: number
  /** Per-contract unrealized loss (cents) to trigger auto sell */
  paper_stop_loss_cents: number
  /** Sleep between exit-monitor ticks */
  paper_exit_interval_seconds: number
}

export interface RiskCheckRequest {
  ticker: string
  price_cents: number
  count: number
  daily_loss_cents?: number
}

export interface RiskCheckResponse {
  allowed: boolean
  reason?: string
  checks?: Record<string, boolean>
}

export interface OrderRequest {
  ticker: string
  side: 'yes' | 'no'
  price_cents: number
  count: number
  daily_loss_cents?: number
  confirm_live?: boolean
}

export interface PaperOrderMtm {
  ok: boolean
  error?: string
  detail?: string
  market_title?: string
  yes_mid_cents?: number
  cost_cents?: number
  mark_value_cents?: number
  unrealized_pnl_cents?: number
  unrealized_pnl_dollars?: number
}

export interface PaperOrder {
  // Backend stores these in SQLite and returns `id` (number) in list endpoints.
  id?: number
  ticker: string
  side: string
  price_cents: number
  count: number
  created_at: number
  rule_id?: number
  paper?: boolean
  would_place?: unknown
  opportunity_title?: string
  mtm?: PaperOrderMtm
}

export interface PaperPnlSummary {
  order_count: number
  orders_with_quote: number
  total_cost_cents: number
  total_mark_value_cents: number
  total_unrealized_pnl_cents: number
  total_unrealized_pnl_dollars: number
}

export interface PaperPnlResponse {
  kalshi_configured: boolean
  summary: PaperPnlSummary
  orders: PaperOrder[]
  note?: string
}

/** Ledger-based open lots (aggregated) + lifetime realized from simulated sells */
export interface PaperPositionRow {
  ticker: string
  side: string
  open_count: number
  avg_entry_cents: number
  cost_basis_cents: number
  mark_price_cents: number | null
  unrealized_pnl_cents: number | null
  quote_ok: boolean
  title?: string
}

export interface PaperPositionsResponse {
  open_positions: PaperPositionRow[]
  total_realized_pnl_cents: number
  total_unrealized_pnl_cents: number
  note?: string
}

export interface PaperCloseResponse {
  ok: boolean
  execution_id: number
  exit_price_cents: number
  sell_count: number
  realized_pnl_cents: number
  total_realized_pnl_cents: number
}

export interface Rule {
  rule_id: string
  name: string
  template_id: string
  enabled: boolean
  config: Record<string, unknown>
  created_at?: string
}

export interface RuleRun {
  run_id: string
  rule_id: string
  rule_name?: string
  started_at: string
  finished_at?: string
  status: string
  trades_placed?: number
  error?: string
}

export interface JobsStatus {
  scheduler_running?: boolean
  jobs?: unknown[]
  next_run?: string
}

export interface DashboardData {
  strategy?: Strategy
  rules?: Rule[]
  rule_runs?: RuleRun[]
  paper_orders?: PaperOrder[]
  jobs?: JobsStatus
}

/** POST /api/v1/analysis/market response */
export interface AnalysisNewsBlock {
  configured?: boolean
  ok?: boolean
  query?: string
  headlines?: { title: string; source?: string }[]
  error?: string
}

export interface MarketAnalysisPayload {
  ticker?: string
  title?: string
  implied_yes_probability?: number
  model_yes_probability?: number
  confidence?: number
  confidence_label?: string
  edge_vs_market_yes?: number
  source?: string
  rationale?: string
  news?: AnalysisNewsBlock
  factors?: Record<string, unknown>
}

export interface MarketAnalysisResponse {
  ok: boolean
  analysis: MarketAnalysisPayload
  claude_enriched: boolean
  news_fetched: boolean
}

/** Stored row from POST /api/v1/analysis/market (SQLite history) */
export interface AnalysisSnapshotRow {
  id: number
  ticker: string
  title: string
  created_at: number
  analysis: Record<string, unknown>
  claude_enriched: boolean
  news_fetched: boolean
}
