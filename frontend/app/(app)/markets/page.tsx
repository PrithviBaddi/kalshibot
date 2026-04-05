'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api, Market, MarketsResponse, formatApiError } from '@/lib/api'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { KalshiConnectionHint } from '@/components/KalshiConnectionHint'

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [seriesTicker, setSeriesTicker] = useState('')
  const [limit, setLimit] = useState(25)
  const [loaded, setLoaded] = useState(false)

  async function load(cur?: string) {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ limit: String(limit), mve_filter: 'exclude' })
      if (seriesTicker.trim()) params.set('series_ticker', seriesTicker.trim())
      if (cur) params.set('cursor', cur)
      const d = await api.get<MarketsResponse>(`/api/v1/markets?${params}`)
      if (cur) {
        setMarkets(prev => [...prev, ...(d.markets ?? [])])
      } else {
        setMarkets(d.markets ?? [])
      }
      setNextCursor(d.cursor)
      setLoaded(true)
    } catch (e: unknown) { setError(formatApiError(e)) }
    finally { setLoading(false) }
  }

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Markets</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          Browse all open markets on Kalshi. Combo/parlay markets filtered out by default.
        </p>
      </div>

      <KalshiConnectionHint />

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Series ticker (optional)</div>
            <input placeholder="e.g. KXPRES, KXBTC..." value={seriesTicker}
              onChange={e => setSeriesTicker(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Per page</div>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ width: 80 }}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => load()} disabled={loading}>
            {loading && !loaded ? '◌ Loading...' : 'Load Markets'}
          </button>
        </div>
      </div>

      {error && <ApiErrorBanner message={error} onDismiss={() => setError('')} />}

      {markets.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Yes bid</th>
                <th>Yes ask</th>
                <th>Volume</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {markets.map(m => (
                <tr key={m.ticker}>
                  <td style={{ maxWidth: 300 }}>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 12, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.title || m.ticker}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{m.ticker}</div>
                  </td>
                  <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                    {m.yes_bid_dollars ? `${(parseFloat(m.yes_bid_dollars) * 100).toFixed(0)}¢` : '—'}
                  </td>
                  <td style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                    {m.yes_ask_dollars ? `${(parseFloat(m.yes_ask_dollars) * 100).toFixed(0)}¢` : '—'}
                  </td>
                  <td style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                    {m.volume_fp ? Number(m.volume_fp).toLocaleString() : '—'}
                  </td>
                  <td>
                    <span className={`badge ${m.status === 'active' ? 'badge-green' : 'badge-dim'}`}>
                      {m.status ?? 'open'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/markets/${encodeURIComponent(m.ticker)}`}
                      className="btn btn-ghost btn-sm">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div style={{ textAlign: 'center' }}>
          <button className="btn btn-ghost" onClick={() => load(nextCursor)} disabled={loading}>
            {loading ? '◌ Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {loaded && markets.length === 0 && (
        <div className="empty">
          No rows in this page. Check the series ticker spelling (use <Link href="/scanner" style={{ color: 'var(--accent)' }}>Scanner</Link> to discover series), or tap <strong>Load more</strong> if you used pagination.
        </div>
      )}

      {!loaded && (
        <div className="empty">
          <strong>Step 1:</strong> Optionally enter a Kalshi <code style={{ fontSize: 11 }}>series_ticker</code> to narrow results.
          <br />
          <strong>Step 2:</strong> Click <strong>Load Markets</strong> to fetch open contracts from the API.
        </div>
      )}
    </div>
  )
}
