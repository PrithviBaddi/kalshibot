'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api, Market, RiskCheckResponse } from '@/lib/api'

export default function MarketDetailPage() {
  const params = useParams()
  const ticker = decodeURIComponent(params.ticker as string)
  const [market, setMarket] = useState<Market | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [riskResult, setRiskResult] = useState<RiskCheckResponse | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    api.get<{ market: Market }>(`/api/v1/markets/${encodeURIComponent(ticker)}`)
      .then(d => setMarket(d.market))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker])

  async function checkRisk() {
    if (!market) return
    setChecking(true)
    try {
      const midCents = market.yes_bid_dollars && market.yes_ask_dollars
        ? Math.round((parseFloat(market.yes_bid_dollars) + parseFloat(market.yes_ask_dollars)) / 2 * 100)
        : 50
      const r = await api.post<RiskCheckResponse>('/api/v1/risk/check-order', {
        ticker, price_cents: midCents, count: 1
      })
      setRiskResult(r)
    } catch(e: any) { setError(e.message) }
    finally { setChecking(false) }
  }

  if (loading) return <div style={{ padding: 48, color: 'var(--text2)', fontSize: 13 }}>Loading market...</div>
  if (error) return <div style={{ padding: 48, color: 'var(--red)', fontSize: 13 }}>{error}</div>
  if (!market) return null

  const bid = market.yes_bid_dollars ? parseFloat(market.yes_bid_dollars) * 100 : null
  const ask = market.yes_ask_dollars ? parseFloat(market.yes_ask_dollars) * 100 : null
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null

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

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost" onClick={checkRisk} disabled={checking}>
          {checking ? '◌ Checking...' : 'Run risk check'}
        </button>
        <a href={`https://kalshi.com/markets/${ticker}`} target="_blank" rel="noopener noreferrer"
          className="btn btn-ghost">
          View on Kalshi ↗
        </a>
      </div>

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
