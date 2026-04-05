'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api, Market, RiskCheckResponse, MarketAnalysisResponse, formatApiError } from '@/lib/api'
import { kalshiPublicUrl } from '@/lib/kalshiWeb'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'

function MarketAnalysisPanel({ resp }: { resp: MarketAnalysisResponse }) {
  if (!resp.ok || !resp.analysis) {
    return <div style={{ color: 'var(--text2)', fontSize: 13 }}>Unexpected analysis response.</div>
  }
  const a = resp.analysis
  const pct = (x: number | undefined) =>
    typeof x === 'number' && Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—'
  const edge = a.edge_vs_market_yes
  const edgeNum = typeof edge === 'number' && Number.isFinite(edge) ? edge : null
  const claude = resp.claude_enriched === true
  const newsOk = resp.news_fetched === true
  let src = 'Source: market mid baseline (liquidity-based confidence)'
  if (claude && newsOk) src = 'Source: Claude + market + NewsAPI (server keys)'
  else if (claude) src = 'Source: Claude + market (ANTHROPIC_API_KEY on server)'
  else if (newsOk) src = 'Source: market baseline; NewsAPI headlines attached'
  const n = a.news
  const headlines = n && n.ok === true && Array.isArray(n.headlines) ? n.headlines : []
  return (
    <div>
      <p style={{ color: 'var(--text2)', fontSize: 11, lineHeight: 1.45, marginBottom: 12 }}>
        <strong style={{ color: 'var(--text)' }}>How this works.</strong>{' '}
        <strong>Market mid</strong> is the YES probability implied by Kalshi&apos;s live bid/ask midpoint (same as the stat cards above).{' '}
        <strong>Model P(YES)</strong> starts from that mid; if the server has{' '}
        <code style={{ fontSize: 10 }}>ANTHROPIC_API_KEY</code>, Claude may adjust it and write the rationale using the title plus optional NewsAPI snippets—not a crystal ball, just structured reasoning.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 13, marginBottom: 12 }}>
        <div>
          <div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>Market mid (order book)</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16 }}>{pct(a.implied_yes_probability)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>Model P(YES)</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>
            {pct(a.model_yes_probability)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
            {claude ? 'Claude-adjusted' : 'Same as mid (no LLM or Claude unavailable)'}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>Edge vs market</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: 16,
              color:
                edgeNum == null ? 'var(--text3)' : edgeNum > 0 ? 'var(--accent)' : edgeNum < 0 ? 'var(--red)' : 'var(--text)',
            }}
          >
            {edgeNum == null ? '—' : `${edgeNum >= 0 ? '+' : ''}${(edgeNum * 100).toFixed(1)} pp`}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 2 }}>Confidence</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16 }}>
            {typeof a.confidence === 'number' && Number.isFinite(a.confidence)
              ? `${(a.confidence * 100).toFixed(0)}%${a.confidence_label ? ` · ${a.confidence_label}` : ''}`
              : '—'}
          </div>
        </div>
      </div>
      {a.rationale && (
        <p style={{ color: 'var(--text)', fontSize: 12, lineHeight: 1.45, marginBottom: 12 }}>
          {String(a.rationale).slice(0, 480)}
          {String(a.rationale).length > 480 ? '…' : ''}
        </p>
      )}
      {headlines.length > 0 && (
        <div style={{ marginBottom: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Recent headlines</div>
          {headlines.slice(0, 5).map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.35, marginBottom: 4 }}>
              {h.source ? <span style={{ color: 'var(--accent)' }}>{h.source} </span> : null}
              {String(h.title || '').slice(0, 160)}
            </div>
          ))}
        </div>
      )}
      <div style={{ color: 'var(--text2)', fontSize: 11 }}>{src}</div>
      <div style={{ marginTop: 10 }}>
        <Link href="/dashboard" style={{ fontSize: 11 }}>View history on dashboard →</Link>
      </div>
    </div>
  )
}

export default function MarketDetailPage() {
  const params = useParams()
  const ticker = decodeURIComponent(params.ticker as string)
  const [market, setMarket] = useState<Market | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [riskError, setRiskError] = useState('')
  const [riskResult, setRiskResult] = useState<RiskCheckResponse | null>(null)
  const [checking, setChecking] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisResp, setAnalysisResp] = useState<MarketAnalysisResponse | null>(null)

  useEffect(() => {
    api.get<{ market: Market }>(`/api/v1/markets/${encodeURIComponent(ticker)}`)
      .then(d => setMarket(d.market))
      .catch((e: unknown) => setError(formatApiError(e)))
      .finally(() => setLoading(false))
  }, [ticker])

  async function checkRisk() {
    if (!market) return
    setChecking(true)
    setRiskError('')
    try {
      const midCents = market.yes_bid_dollars && market.yes_ask_dollars
        ? Math.round((parseFloat(market.yes_bid_dollars) + parseFloat(market.yes_ask_dollars)) / 2 * 100)
        : 50
      const r = await api.post<RiskCheckResponse>('/api/v1/risk/check-order', {
        ticker, price_cents: midCents, count: 1
      })
      setRiskResult(r)
    } catch (e: unknown) {
      setRiskError(formatApiError(e))
    }
    finally { setChecking(false) }
  }

  async function runAnalysis() {
    if (!market) return
    setAnalysisLoading(true)
    setAnalysisError('')
    try {
      const r = await api.post<MarketAnalysisResponse>('/api/v1/analysis/market', {
        ticker,
        title: market.title || null,
      })
      setAnalysisResp(r)
    } catch (e: unknown) {
      setAnalysisResp(null)
      setAnalysisError(formatApiError(e))
    } finally {
      setAnalysisLoading(false)
    }
  }

  if (loading) return <div style={{ padding: 48, color: 'var(--text2)', fontSize: 13 }}>Loading market...</div>
  if (error) {
    return (
      <div className="fade-in" style={{ padding: 48, maxWidth: 520 }}>
        <ApiErrorBanner title="Couldn't load this market" message={error} />
        <Link href="/markets" style={{ fontSize: 13, color: 'var(--accent)' }}>← Back to markets</Link>
      </div>
    )
  }
  if (!market) return null

  const bid = market.yes_bid_dollars ? parseFloat(market.yes_bid_dollars) * 100 : null
  const ask = market.yes_ask_dollars ? parseFloat(market.yes_ask_dollars) * 100 : null
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null
  const kalshiLink = kalshiPublicUrl(market)

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 8 }}>
        <Link href="/markets" style={{ fontSize: 12, color: 'var(--text2)' }}>← Markets</Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>{ticker}</div>
        <h1 style={{ fontSize: 22, lineHeight: 1.3, marginBottom: 8 }}>{market.title}</h1>
        {market.subtitle && <p style={{ color: 'var(--text2)', fontSize: 13 }}>{market.subtitle}</p>}
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Yes bid (buy price)</div>
          <div className="stat-value text-accent">{bid !== null ? `${bid.toFixed(0)}¢` : '—'}</div>
          <div className="stat-sub">Best price to buy YES</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Yes ask (sell price)</div>
          <div className="stat-value">{ask !== null ? `${ask.toFixed(0)}¢` : '—'}</div>
          <div className="stat-sub">Cheapest YES available</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Mid probability</div>
          <div className="stat-value text-blue">{mid !== null ? `${mid.toFixed(0)}%` : '—'}</div>
          <div className="stat-sub">Market implied chance</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Volume</div>
          <div className="stat-value">{market.volume_fp ? Number(market.volume_fp).toLocaleString() : '—'}</div>
          <div className="stat-sub">Total contracts traded</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={runAnalysis} disabled={analysisLoading}>
          {analysisLoading ? '◌ Running analysis…' : analysisResp ? 'Refresh analysis' : 'Run analysis'}
        </button>
        <button className="btn btn-ghost" onClick={checkRisk} disabled={checking}>
          {checking ? '◌ Checking...' : 'Run risk check'}
        </button>
        <a
          href={kalshiLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost"
          title={
            kalshiLink.kind === 'event'
              ? 'Opens this event on kalshi.com'
              : kalshiLink.kind === 'series'
                ? 'Opens this series on kalshi.com'
                : 'Kalshi home (event/series not in API payload)'
          }
        >
          {kalshiLink.kind === 'home' ? 'Open Kalshi ↗' : 'View on Kalshi ↗'}
        </a>
      </div>

      {riskError && (
        <ApiErrorBanner title="Risk check failed" message={riskError} onDismiss={() => setRiskError('')} />
      )}

      {(analysisLoading || analysisError || analysisResp) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Analysis</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>Live Kalshi quote + optional Claude</div>
          {analysisLoading && (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>Fetching market snapshot and model…</div>
          )}
          {!analysisLoading && analysisError && (
            <ApiErrorBanner title="Analysis failed" message={analysisError} onDismiss={() => setAnalysisError('')} />
          )}
          {!analysisLoading && analysisResp && <MarketAnalysisPanel resp={analysisResp} />}
        </div>
      )}

      {riskResult && (
        <div style={{
          background: riskResult.allowed ? 'var(--accent-bg)' : 'var(--red-bg)',
          border: `1px solid ${riskResult.allowed ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,106,0.3)'}`,
          borderRadius: 8, padding: '14px 16px',
          color: riskResult.allowed ? 'var(--accent)' : 'var(--red)', fontSize: 13
        }}>
          {riskResult.allowed
            ? '✓ Risk check passed — your bot settings allow trading this market'
            : `✗ Blocked — ${riskResult.reason}`}
        </div>
      )}
    </div>
  )
}
