const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
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

// --- Types ---

export interface HealthResponse { status: string }

export interface StatusResponse {
  kalshi_configured: boolean
  balance?: number
  balance_dollars?: string
  error?: string
  ticker_hub_running?: boolean
}

export interface Market {
  ticker: string
  title: string
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
