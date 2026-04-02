'use client'
import { useEffect, useState } from 'react'
import { api, PaperOrder } from '@/lib/api'

export default function PaperOrdersPage() {
  const [orders, setOrders] = useState<PaperOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ orders: PaperOrder[] }>('/api/v1/paper/orders')
      .then(d => setOrders(d.orders ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const totalNotional = orders.reduce((s, o) => s + o.price_cents * o.count, 0) / 100
  const yesSide = orders.filter(o => o.side === 'yes').length
  const noSide = orders.filter(o => o.side === 'no').length

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Paper Orders</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          Simulated trades placed while paper mode is on. No real money involved.
        </p>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: 'var(--red)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total orders</div>
          <div className="stat-value">{orders.length}</div>
          <div className="stat-sub">simulated trades</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Simulated spend</div>
          <div className="stat-value">${totalNotional.toFixed(2)}</div>
          <div className="stat-sub">paper money only</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">YES / NO split</div>
          <div className="stat-value">
            <span className="text-accent">{yesSide}</span>
            <span style={{ fontSize: 16, color: 'var(--text3)' }}> / </span>
            <span className="text-red">{noSide}</span>
          </div>
          <div className="stat-sub">yes / no side</div>
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ padding: '40px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>↗</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#fff', marginBottom: 8 }}>No paper orders yet</div>
            <div>Enable a rule and run it, or use the scanner to place a simulated trade.</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Market</th>
                <th>Side</th>
                <th>Price</th>
                <th>Count</th>
                <th>Notional</th>
                <th>Time</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={String(o.id ?? `${o.ticker}-${o.side}-${o.price_cents}-${o.count}-${o.created_at}`)}>
                  <td style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                    {String(o.id ?? '—')}
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text2)' }}>
                    {o.ticker}
                  </td>
                  <td>
                    <span className={`badge ${o.side === 'yes' ? 'badge-green' : 'badge-red'}`}>
                      {o.side.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{o.price_cents}¢</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{o.count}</td>
                  <td style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                    ${((o.price_cents * o.count) / 100).toFixed(2)}
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 11 }}>
                    {new Date((o.created_at ?? 0) * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                    {o.rule_id != null ? String(o.rule_id) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
