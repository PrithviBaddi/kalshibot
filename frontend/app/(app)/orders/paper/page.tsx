'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  api,
  formatApiError,
  PaperCloseResponse,
  PaperOrder,
  PaperPnlResponse,
  PaperPositionsResponse,
} from '@/lib/api'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { KalshiConnectionHint } from '@/components/KalshiConnectionHint'

function fmtUsdFromCents(cents: number | null | undefined, signed = false): string {
  if (cents == null || Number.isNaN(cents)) return '—'
  const d = cents / 100
  const s = signed && d > 0 ? '+' : ''
  return `${s}$${d.toFixed(2)}`
}

export default function PaperOrdersPage() {
  const [orders, setOrders] = useState<PaperOrder[]>([])
  const [pnl, setPnl] = useState<PaperPnlResponse | null>(null)
  const [pos, setPos] = useState<PaperPositionsResponse | null>(null)
  const [posError, setPosError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState<string | null>(null)
  const [closeMsg, setCloseMsg] = useState('')

  const load = useCallback(async () => {
    setError('')
    setPosError('')
    const [pnlD, posResult] = await Promise.allSettled([
      api.get<PaperPnlResponse>('/api/v1/dashboard/paper-pnl?limit=500'),
      api.get<PaperPositionsResponse>('/api/v1/dashboard/paper-positions'),
    ])

    if (pnlD.status === 'fulfilled') {
      const d = pnlD.value
      setPnl(d)
      setOrders(d.orders ?? [])
    } else {
      setError(formatApiError(pnlD.reason))
    }

    if (posResult.status === 'fulfilled') {
      setPos(posResult.value)
    } else {
      setPosError(formatApiError(posResult.reason))
      setPos(null)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  function resolveExitPriceCents(opts?: {
    markPriceCents?: number | null
    avgEntryCents?: number | null
  }): number | undefined {
    const m = opts?.markPriceCents
    if (m != null && m >= 1 && m <= 99) return Math.round(m)
    const a = opts?.avgEntryCents
    if (a != null && Number.isFinite(a)) {
      // No live quote: close at average entry (flat P&L) so the ledger can clear without a second Kalshi call.
      return Math.max(1, Math.min(99, Math.round(a)))
    }
    return undefined
  }

  async function closeLot(
    ticker: string,
    side: 'yes' | 'no',
    opts?: { markPriceCents?: number | null; avgEntryCents?: number | null },
  ) {
    setCloseMsg('')
    setClosing(`${ticker}|${side}`)
    try {
      const body: { ticker: string; side: 'yes' | 'no'; exit_price_cents?: number } = { ticker, side }
      const px = resolveExitPriceCents(opts)
      if (px != null) body.exit_price_cents = px
      const r = await api.post<PaperCloseResponse>('/api/v1/paper/close', body)
      setCloseMsg(
        `Closed at ${r.exit_price_cents}¢ — realized ${fmtUsdFromCents(r.realized_pnl_cents, true)} on this sale.`,
      )
      await load()
    } catch (e: unknown) {
      setCloseMsg(`Close failed: ${formatApiError(e)}`)
    } finally {
      setClosing(null)
    }
  }

  const summary = pnl?.summary
  const realizedCents = pos?.total_realized_pnl_cents ?? 0
  const unrealOpenCents = pos?.total_unrealized_pnl_cents ?? 0
  const openRows = pos?.open_positions ?? []
  const yesSide = orders.filter(o => o.side === 'yes').length
  const noSide = orders.filter(o => o.side === 'no').length

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Paper trading</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          <strong>Realized P&amp;L</strong> is profit or loss after a simulated <strong>sell</strong> (you close, or auto-exit hits your targets).
          <strong> Unrealized P&amp;L</strong> is mark-to-market on <strong>open</strong> positions — what you would make or lose if you sold at the current mid right now.
        </p>
        {pnl?.note && (
          <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: 8, maxWidth: 820 }}>
            {pnl.note}
          </p>
        )}
        {pos?.note && (
          <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: 6, maxWidth: 820 }}>
            {pos.note}
          </p>
        )}
      </div>

      <KalshiConnectionHint />

      {error && (
        <ApiErrorBanner
          title="Paper P&L data"
          message={error}
          onDismiss={() => setError('')}
        />
      )}
      {posError && (
        <ApiErrorBanner
          title="Open positions & realized P&L"
          message={`${posError} If Kalshi isn’t configured on the server, marks and some totals stay empty.`}
          onDismiss={() => setPosError('')}
        />
      )}

      {closeMsg && (
        <div style={{ background: 'var(--accent-bg)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text)' }}>
          {closeMsg}
        </div>
      )}

      {/* Portfolio (ledger) */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Realized P&amp;L (closed)</div>
          <div
            className="stat-value"
            style={{
              color:
                realizedCents > 0 ? 'var(--accent)' : realizedCents < 0 ? 'var(--red)' : 'var(--text)',
            }}
          >
            {pos ? fmtUsdFromCents(realizedCents, true) : '—'}
          </div>
          <div className="stat-sub">after simulated sells</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unrealized (open)</div>
          <div
            className="stat-value"
            style={{
              color:
                pos == null
                  ? 'var(--text)'
                  : unrealOpenCents > 0
                    ? 'var(--accent)'
                    : unrealOpenCents < 0
                      ? 'var(--red)'
                      : 'var(--text)',
            }}
          >
            {pos ? fmtUsdFromCents(unrealOpenCents, true) : '—'}
          </div>
          <div className="stat-sub">mark-to-market on open lots</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open positions</div>
          <div className="stat-value">{openRows.length}</div>
          <div className="stat-sub">aggregated by market &amp; side</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Simulated fills</div>
          <div className="stat-value">{orders.length}</div>
          <div className="stat-sub">
            <span className="text-accent">{yesSide}</span>
            <span style={{ color: 'var(--text3)' }}> / </span>
            <span className="text-red">{noSide}</span>
            {' '}yes / no rows
          </div>
        </div>
      </div>

      {/* Open positions — sell price = current mid for that side */}
      {!loading && pos && (
        <div className="card" style={{ marginBottom: 20, padding: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>Open positions</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              &quot;Mark / sell price&quot; uses the live mid when Kalshi returns a quote. If there is no quote, Close still works by exiting at your <strong>average entry</strong> (roughly flat P&amp;L) so positions clear without spamming the API.
            </div>
          </div>
          {openRows.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>No open contracts — everything is closed or you have not bought paper yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Avg entry</th>
                  <th>Mark (sell now)</th>
                  <th>Unrealized</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openRows.map(row => {
                  const key = `${row.ticker}|${row.side}`
                  const busy = closing === key
                  const title = row.title || row.ticker
                  return (
                    <tr key={key}>
                      <td style={{ maxWidth: 260, fontSize: 11, color: 'var(--text2)' }} title={row.ticker}>
                        {title}
                      </td>
                      <td>
                        <span className={`badge ${row.side === 'yes' ? 'badge-green' : 'badge-red'}`}>
                          {String(row.side).toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{row.open_count}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                        {row.avg_entry_cents.toFixed(1)}¢
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                        {row.quote_ok && row.mark_price_cents != null ? `${row.mark_price_cents}¢` : '—'}
                      </td>
                      <td style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: !row.quote_ok || row.unrealized_pnl_cents == null
                          ? 'var(--text3)'
                          : row.unrealized_pnl_cents > 0
                            ? 'var(--accent)'
                            : row.unrealized_pnl_cents < 0
                              ? 'var(--red)'
                              : 'var(--text2)',
                      }}
                      >
                        {row.quote_ok && row.unrealized_pnl_cents != null
                          ? fmtUsdFromCents(row.unrealized_pnl_cents, true)
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() =>
                            closeLot(row.ticker, row.side === 'yes' ? 'yes' : 'no', {
                              markPriceCents: row.mark_price_cents,
                              avgEntryCents: row.avg_entry_cents,
                            })}
                        >
                          {busy ? '…' : 'Close'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Per-fill history (MTM on each buy row — can overlap with aggregated positions) */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Fill history (all simulated buys)</h2>
        <p style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 800 }}>
          Each row is one paper fill. MTM here is per fill; totals above use the <strong>position ledger</strong> for open risk and realized P&amp;L.
        </p>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ padding: '40px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>↗</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#fff', marginBottom: 8 }}>No paper fills yet</div>
            <div>Enable a rule and run it, or place a simulated trade from the scanner.</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="grid-4" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', gap: 12 }}>
            <div className="stat-card" style={{ margin: 0 }}>
              <div className="stat-label">Per-fill cost basis (sum)</div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                ${summary != null ? (summary.total_cost_cents / 100).toFixed(2) : '—'}
              </div>
              <div className="stat-sub">from paper-pnl view</div>
            </div>
            <div className="stat-card" style={{ margin: 0 }}>
              <div className="stat-label">Per-fill unrealized (sum)</div>
              <div
                className="stat-value"
                style={{
                  fontSize: 18,
                  color:
                    summary == null
                      ? 'var(--text)'
                      : summary.total_unrealized_pnl_dollars > 0
                        ? 'var(--accent)'
                        : summary.total_unrealized_pnl_dollars < 0
                          ? 'var(--red)'
                          : 'var(--text)',
                }}
              >
                {summary == null
                  ? '—'
                  : `${summary.total_unrealized_pnl_dollars >= 0 ? '+' : ''}$${summary.total_unrealized_pnl_dollars.toFixed(2)}`}
              </div>
              <div className="stat-sub">may differ from open lots if you doubled up</div>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Market</th>
                <th>Side</th>
                <th>Entry</th>
                <th>Count</th>
                <th>Cost</th>
                <th>Mark</th>
                <th>Unrealized</th>
                <th>Time</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const m = o.mtm
                const costD = m?.ok && m.cost_cents != null ? m.cost_cents / 100 : (o.price_cents * o.count) / 100
                const markD = m?.ok && m.mark_value_cents != null ? m.mark_value_cents / 100 : null
                const u = m?.ok ? m.unrealized_pnl_dollars : null
                const title = (m?.ok && m.market_title) ? m.market_title : o.opportunity_title
                return (
                <tr key={String(o.id ?? `${o.ticker}-${o.side}-${o.price_cents}-${o.count}-${o.created_at}`)}>
                  <td style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                    {String(o.id ?? '—')}
                  </td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text2)' }}>
                    {title || o.ticker}
                  </td>
                  <td>
                    <span className={`badge ${o.side === 'yes' ? 'badge-green' : 'badge-red'}`}>
                      {o.side.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{o.price_cents}¢</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{o.count}</td>
                  <td style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                    ${costD.toFixed(2)}
                  </td>
                  <td style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {markD == null ? '—' : `$${markD.toFixed(2)}`}
                  </td>
                  <td style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: u == null ? 'var(--text3)' : u > 0 ? 'var(--accent)' : u < 0 ? 'var(--red)' : 'var(--text2)',
                  }}>
                    {u == null ? '—' : `${u >= 0 ? '+' : ''}$${u.toFixed(2)}`}
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 11 }}>
                    {new Date((o.created_at ?? 0) * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                    {o.rule_id != null ? String(o.rule_id) : '—'}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
