import type { DailyPick, HistoryRow, PerformanceStats, RecommendationType } from './types';
import { getAccessToken } from './auth';

function normalizeApiBase(raw?: string): string {
  const v = (raw || '').trim();
  if (!v) return 'http://127.0.0.1:8000';
  if (v.startsWith('http://') || v.startsWith('https://')) return v.replace(/\/+$/, '');
  return `https://${v.replace(/\/+$/, '')}`;
}

const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_BASE);
const ADMIN_TOKEN = (process.env.NEXT_PUBLIC_API_TOKEN || '').trim();

function authHeaders(): Record<string, string> {
  const user = getAccessToken();
  const token = user || ADMIN_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Failed to fetch');
  }
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`${r.status}: ${text || r.statusText}`);
  }
  return (await r.json()) as T;
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

export function analysisToDailyPick(
  analysis: Record<string, unknown>,
  category = 'Analysis',
): DailyPick {
  const kalshiProb = Math.round((Number(analysis.market_implied_yes || 0) || 0) * 100);
  const modelProb = Math.round((Number(analysis.model_yes_probability || 0) || 0) * 100);
  return {
    id: String(analysis.ticker || 'ondemand'),
    date: new Date().toISOString().slice(0, 10),
    question: String(analysis.title || analysis.ticker || ''),
    ticker: String(analysis.ticker || ''),
    category: String(analysis.category || category),
    kalshiProb,
    modelProb,
    recommendation: toRec(analysis.recommended_action),
    confidence: Math.max(1, Math.min(100, Number(analysis.confidence_score || 50))),
    reasoning: String(analysis.reasoning || ''),
    edge: Math.round(Math.abs(Number(analysis.edge || 0)) * 100),
    source: 'KalshiBot AI',
    sourcesUsed: Array.isArray(analysis.context_sources_used)
      ? (analysis.context_sources_used as string[])
      : [],
    updatedAt: 'just now',
  };
}

export async function runOnDemandAnalysis(ticker: string): Promise<DailyPick> {
  const d = await apiPost<{ ok: boolean; analysis: Record<string, unknown> }>(
    '/api/v1/analysis/on-demand',
    { ticker },
  );
  return analysisToDailyPick(d.analysis);
}

export type BatchRun = {
  run_id: string;
  timestamp: number;
  total_picks: number;
  resolved_count: number;
  accuracy_percent: number | null;
};

export type BatchAccuracy = {
  overall: { total: number; resolved: number; actionable_resolved: number; correct: number; accuracy_percent: number | null };
  by_category: Record<string, { total: number; resolved: number; actionable_resolved: number; correct: number; accuracy_percent: number | null }>;
  by_recommended_action: Record<string, { total: number; resolved: number; actionable_resolved: number; correct: number; accuracy_percent: number | null }>;
  by_confidence_band: Record<string, { total: number; resolved: number; actionable_resolved: number; correct: number; accuracy_percent: number | null }>;
};

export async function startBatchAnalyze(categories: string[], topN: number): Promise<string> {
  const d = await apiPost<{ ok: boolean; run_id: string }>('/api/v1/testing/batch-analyze', {
    categories,
    top_n: topN,
  });
  return d.run_id;
}

export async function fetchBatchRuns(): Promise<BatchRun[]> {
  const d = await apiGet<{ ok: boolean; runs: BatchRun[] }>('/api/v1/testing/batch-runs');
  return d.runs || [];
}

export async function fetchBatchAccuracy(): Promise<BatchAccuracy> {
  const d = await apiGet<BatchAccuracy & { ok: boolean }>('/api/v1/testing/accuracy');
  return {
    overall: d.overall,
    by_category: d.by_category || {},
    by_recommended_action: d.by_recommended_action || {},
    by_confidence_band: d.by_confidence_band || {},
  };
}

export type MarketRow = {
  ticker: string;
  title: string;
  category: string;
  volume: number;
  midProb: number;
};

export async function fetchMarketsBrowse(limit = 40): Promise<MarketRow[]> {
  const d = await apiGet<{ markets?: Array<Record<string, unknown>> }>(
    `/api/v1/markets?limit=${limit}&mve_filter=exclude`,
  );
  const markets = Array.isArray(d.markets) ? d.markets : [];
  return markets
    .map((m) => {
      const yesBid = Number(m.yes_bid_dollars ?? m.yes_bid ?? 0);
      const yesAsk = Number(m.yes_ask_dollars ?? m.yes_ask ?? 0);
      const mid =
        yesBid > 0 && yesAsk > 0
          ? (yesBid + yesAsk) / 2
          : Number(m.last_price_dollars ?? m.last_price ?? 0.5);
      return {
        ticker: String(m.ticker || ''),
        title: String(m.title || m.subtitle || m.ticker || ''),
        category: String(m.category || 'Market'),
        volume: Number(m.volume ?? m.volume_24h ?? 0),
        midProb: Math.round(mid * 100),
      };
    })
    .filter((m) => m.ticker);
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

