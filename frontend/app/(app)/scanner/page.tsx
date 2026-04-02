'use client'
import { useEffect, useState } from 'react'
import { api, Opportunity, Series } from '@/lib/api'

const CATEGORIES = ['Politics', 'Economics', 'Financials', 'Climate', 'Tech', 'Science', 'Culture']

export default function ScannerPage() {
  const [category, setCategory] = useState('Politics')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [scanning, setScanning] = useState(false)
  const [scannedCount, setScannedCount] = useState(0)
  const [error, setError] = useState('')
  const [topN, setTopN] = useState(20)
  const [maxSpread, setMaxSpread] = useState(0.2)
  const [minVolume, setMinVolume] = useState(0)
  const [riskResult, setRiskResult] = useState<{ ticker: string; allowed: boolean; reason?: string } | null>(null)

  async function scan() {
    setScanning(true); setError(''); setOpportunities([])
    try {
      const params = new URLSearchParams({
        category,
        top_n: String(topN),
        max_spread: String(maxSpread),
        min_volume: String(minVolume),
      })
      const d = await api.get<{ opportunities: Opportunity[]; scanned_count: number }>(
        `/api/v1/scanner/opportunities?${params}`
      )
      setOpportunities(d.opportunities ?? [])
      setScannedCount(d.scanned_count ?? 0)
    } catch (e: any) { setError(e.message) }
    finally { setScanning(false) }
  }

  async function riskCheck(opp: Opportunity) {
    try {
      const r = await api.post<{ allowed: boolean; reason?: string }>('/api/v1/risk/check-order', {
        ticker: opp.ticker,
        price_cents: Math.round(opp.mid_prob * 100),
        count: 1,
      })
      setRiskResult({ ticker: opp.ticker, ...r })
    } catch(e: any) { setError(e.message) }
  }

  const spread2color = (s: number) => s < 0.05 ? 'var(--accent)' : s < 0.15 ? 'var(--amber)' : 'var(--red)'
  const score2bar = (s: number) => Math.min(100, Math.round(s * 10))

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Market Scanner</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          Find the most liquid, efficiently-priced non-sports markets across Kalshi.
        </p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Category buttons */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Category</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button key={cat}
                  className={`btn btn-sm ${category === cat ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setCategory(cat)}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Top N</div>
            <input type="number" value={topN} min={5} max={100}
              onChange={e => setTopN(Number(e.target.value))} style={{ width: 70 }} />
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Max spread</div>
            <input type="number" value={maxSpread} min={0} max={1} step={0.01}
              onChange={e => setMaxSpread(Number(e.target.value))} style={{ width: 80 }} />
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Min volume</div>
            <input type="number" value={minVolume} min={0}
              onChange={e => setMinVolume(Number(e.target.value))} style={{ width: 90 }} />
          </div>

          <button className="btn btn-primary" onClick={scan} disabled={scanning}
            style={{ flexShrink: 0 }}>
            {scanning ? '◌ Scanning...' : '⊹ Scan Now'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: 'var(--red)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {riskResult && (
        <div style={{
          background: riskResult.allowed ? 'var(--accent-bg)' : 'var(--red-bg)',
          border: `1px solid ${riskResult.allowed ? 'rgba(0,229,160,0.3)' : 'rgba(255,77,106,0.3)'}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          color: riskResult.allowed ? 'var(--accent)' : 'var(--red)', fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span>
            {riskResult.ticker}: {riskResult.allowed ? '✓ Risk check passed — bot can trade this' : `✗ Blocked — ${riskResult.reason}`}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setRiskResult(null)}>×</button>
        </div>
      )}

      {/* Results */}
      {scannedCount > 0 && (
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text2)' }}>
          Scanned {scannedCount} markets · showing top {opportunities.length}
        </div>
      )}

      {opportunities.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Yes bid</th>
                <th>Yes ask</th>
                <th>Mid prob</th>
                <th>Price gap</th>
                <th>Volume</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map(opp => (
                <tr key={opp.ticker}>
                  <td style={{ maxWidth: 260 }}>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 12, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opp.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{opp.ticker}</div>
                  </td>
                  <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{(opp.yes_bid * 100).toFixed(0)}¢</td>
                  <td style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{(opp.yes_ask * 100).toFixed(0)}¢</td>
                  <td style={{ color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{(opp.mid_prob * 100).toFixed(0)}%</td>
                  <td style={{ color: spread2color(opp.spread), fontFamily: 'var(--font-mono)' }}>
                    {(opp.spread * 100).toFixed(1)}¢
                  </td>
                  <td style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                    {opp.volume?.toLocaleString() ?? '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 40, height: 4, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${score2bar(opp.score)}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>{opp.score.toFixed(1)}</span>
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => riskCheck(opp)}>
                      Risk check
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !scanning && scannedCount === 0 && (
          <div className="empty">
            Choose a category and click Scan Now to find opportunities.
          </div>
        )
      )}

      {scanning && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text2)', fontSize: 13 }}>
          ◌ Scanning {category} markets...
        </div>
      )}
    </div>
  )
}
