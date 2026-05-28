import type { DailyPick, HistoryRow, PerformanceStats, RecommendationType } from './types';

function normalizeApiBase(raw?: string): string {
  const v = (raw || '').trim();
  if (!v) return 'http://127.0.0.1:8000';
  if (v.startsWith('http://') || v.startsWith('https://')) return v.replace(/\/+$/, '');
  return `https://${v.replace(/\/+$/, '')}`;
}

const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_BASE);
const ADMIN_TOKEN = (process.env.NEXT_PUBLIC_API_TOKEN || '').trim();

function getAccessToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem('kalshibot_access_token') || '').trim();
  } catch {
    return '';
  }
}

function authHeaders(): Record<string, string> {
  const user = getAccessToken();
  const token = user || ADMIN_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      headers: { 'content-type': 'application/json', ...authHeaders() },
      cache: 'no-store',
    });
  } catch (e) {
    const hint =
      typeof window !== 'undefined'
        ? ` Cannot reach API at ${API_BASE} (NEXT_PUBLIC_API_BASE). Is uvicorn running?`
        : '';
    throw new Error(
      `${e instanceof Error ? e.message : 'Failed to fetch'}.${hint}`.trim(),
    );
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`${r.status}: ${body || r.statusText}`);
  }
  return (await r.json()) as T;
}

function toRec(value: unknown): RecommendationType {
  const s = String(value || 'PASS').toUpperCase().replace(/[- ]/g, '_');
  if (s === 'BUY_YES' || s === 'BUY_NO' || s === 'PASS' || s === 'NO_SIGNAL') return s;
  return 'PASS';
}

function relTimeFromUnix(ts?: number | null): string {
  if (!ts) return 'recently';
  const now = Math.floor(Date.now() / 1000);
  const d = Math.max(0, now - ts);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

type TodayPickResponse = {
  ok: boolean;
  day?: string;
  ticker?: string | null;
  title?: string | null;
  confidence_score?: number | null;
  market_implied_yes?: number | null;
  model_yes_probability?: number | null;
  recommended_action?: string | null;
  reasoning?: string | null;
  edge?: number | null;
  context_sources_used?: string[] | null;
  created_at?: number | null;
  pick?: Record<string, unknown> | null;
};

type HistoryResponse = {
  ok: boolean;
  picks: Array<{
    day: string;
    ticker: string;
    title: string;
    recommended_action: string | null;
    reasoning?: string | null;
    resolved: boolean | null;
    resolution_correct: boolean | null;
    invalid?: boolean | null;
    invalid_reason?: string | null;
    market_implied_yes: number | null;
    model_yes_probability: number | null;
    confidence_score?: number | null;
    edge: number | null;
    context_sources_used?: string[] | null;
    created_at?: number | null;
  }>;
};

type AccuracyResponse = {
  ok: boolean;
  total_picks?: number;
  total_resolved?: number;
  non_pass_resolved_count?: number;
  accuracy_percent?: number | null;
};

export async function fetchTodayPick(): Promise<DailyPick | null> {
  const d = await apiGet<TodayPickResponse>('/api/v1/daily-picks/today');
  if (!d.ok || !d.ticker || !d.title) return null;
  const kalshiProb = Math.round((Number(d.market_implied_yes || 0) || 0) * 100);
  const modelProb = Math.round((Number(d.model_yes_probability || 0) || 0) * 100);
  const category = String((d.pick || {}).category_scanned || '').trim() || 'Daily Pick';
  return {
    id: String(d.day || d.ticker),
    date: String(d.day || new Date().toISOString().slice(0, 10)),
    question: String(d.title),
    ticker: String(d.ticker),
    category,
    kalshiProb,
    modelProb,
    recommendation: toRec(d.recommended_action),
    confidence: Math.max(1, Math.min(100, Number(d.confidence_score || 1))),
    reasoning: String(d.reasoning || 'No reasoning was returned.'),
    edge: Math.round(Math.abs(Number(d.edge || 0)) * 100),
    source: 'KalshiBot AI',
    sourcesUsed: Array.isArray(d.context_sources_used) ? d.context_sources_used : [],
    updatedAt: relTimeFromUnix(d.created_at || null),
  };
}

export async function fetchHistoryRows(): Promise<HistoryRow[]> {
  const d = await apiGet<HistoryResponse>('/api/v1/daily-picks/history');
  const rows = Array.isArray(d.picks) ? d.picks : [];
  return rows.map((r, i) => ({
    id: `${r.day}-${i}`,
    date: r.day,
    question: r.title,
    ticker: r.ticker,
    recommendation: toRec(r.recommended_action),
    resolved: r.resolved === true,
    correct: r.resolution_correct === null ? null : r.resolution_correct === true,
    invalid: r.invalid === true,
    invalidReason: r.invalid_reason ? String(r.invalid_reason) : null,
    kalshiProb: Math.round((Number(r.market_implied_yes || 0) || 0) * 100),
    modelProb: Math.round((Number(r.model_yes_probability || 0) || 0) * 100),
    edge: Math.round(Math.abs(Number(r.edge || 0)) * 100),
  }));
}

export async function fetchLatestPickFromHistory(): Promise<DailyPick | null> {
  const d = await apiGet<HistoryResponse>('/api/v1/daily-picks/history');
  const first = Array.isArray(d.picks) && d.picks.length > 0 ? d.picks[0] : null;
  if (!first) return null;
  const kalshiProb = Math.round((Number(first.market_implied_yes || 0) || 0) * 100);
  const modelProb = Math.round((Number(first.model_yes_probability || 0) || 0) * 100);
  return {
    id: String(first.day || first.ticker),
    date: String(first.day || new Date().toISOString().slice(0, 10)),
    question: String(first.title || first.ticker),
    ticker: String(first.ticker || ''),
    category: 'Latest Pick',
    kalshiProb,
    modelProb,
    recommendation: toRec(first.recommended_action),
    confidence: Math.max(1, Math.min(100, Number(first.confidence_score || 50))),
    reasoning: String(first.reasoning || 'Most recent stored recommendation from KalshiBot.'),
    edge: Math.round(Math.abs(Number(first.edge || 0)) * 100),
    source: 'KalshiBot AI',
    sourcesUsed: Array.isArray(first.context_sources_used) ? first.context_sources_used : [],
    updatedAt: relTimeFromUnix(first.created_at || null),
  };
}

export async function fetchPerformanceStats(): Promise<PerformanceStats> {
  const d = await apiGet<AccuracyResponse>('/api/v1/daily-picks/accuracy');
  const accRaw = d.accuracy_percent;
  const acc =
    accRaw === null || accRaw === undefined
      ? null
      : Number.isFinite(Number(accRaw))
        ? Number(Number(accRaw).toFixed(1))
        : null;
  return {
    totalPicks: Number(d.total_picks || 0),
    resolvedPicks: Number(d.non_pass_resolved_count || 0),
    accuracy: acc,
    currentStreak: 0,
  };
}

