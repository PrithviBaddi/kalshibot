'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Strategy, Rule, RuleRun, PaperOrder, JobsStatus, StatusResponse } from '@/lib/api'

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [runs, setRuns] = useState<RuleRun[]>([])
  const [orders, setOrders] = useState<PaperOrder[]>([])
  const [jobs, setJobs] = useState<JobsStatus | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  async function load() {
    try {
      const [s, d, runsD, ordersD, j] = await Promise.all([
        api.get<StatusResponse>('/api/v1/status'),
        api.get<{ strategy: Strategy }>('/api/v1/dashboard/strategy'),
        api.get<{ rule_runs: RuleRun[] }>('/api/v1/dashboard/rule-runs?limit=10'),
        api.get<{ paper_orders: PaperOrder[] }>('/api/v1/dashboard/paper-orders?limit=10'),
        api.get<{ rules: Rule[] }>('/api/v1/dashboard/rules'),
      ])
      setStatus(s)
      setStrategy(d.strategy)
      setRuns(runsD.rule_runs ?? [])
      setOrders(ordersD.paper_orders ?? [])
      setRules(j.rules ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally { setLoaded(true) }
  }

  useEffect(() => { load() }, [])

  async function runAll() {
    setRunning(true)
    try {
      await api.post('/api/v1/jobs/run-all-enabled-once')
      await load()
    } catch(e: any) { setError(e.message) }
    finally { setRunning(false) }
  }

  const totalPaperValue = orders.reduce((s, o) => s + (o.price_cents * o.count), 0) / 100
  const enabledRules = rules.filter(r => r.enabled).length
  const recentWins = runs.filter(r => r.status === 'ok' || r.status === 'success').length

  if (!loaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text2)', fontSize: 13 }}>
      Loading dashboard...
    </div>
  )

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          {strategy?.paper_mode ? 'Paper mode active — no real money moving' : 'Overview of your trading bot'}
        </p>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: 'var(--red)', fontSize: 12 }}>
          Backend error: {error} — is uvicorn running?
        </div>
      )}

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Kalshi Balance</div>
          <div className="stat-value text-accent">${status?.balance_dollars ?? '—'}</div>
          <div className="stat-sub">{status?.kalshi_configured ? 'Connected' : 'Not connected'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Paper orders</div>
          <div className="stat-value">{orders.length}</div>
          <div className="stat-sub">${totalPaperValue.toFixed(2)} simulated</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active rules</div>
          <div className="stat-value">{enabledRules}<span style={{ fontSize: 14, color: 'var(--text2)' }}>/{rules.length}</span></div>
          <div className="stat-sub">enabled / total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Successful runs</div>
          <div className="stat-value text-accent">{recentWins}</div>
          <div className="stat-sub">of {runs.length} recent</div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={runAll} disabled={running}>
          {running ? '◌ Running...' : '▶ Run All Rules Now'}
        </button>
        <Link href="/scanner" className="btn btn-ghost">⊹ Open Scanner</Link>
        <Link href="/rules/new" className="btn btn-ghost">+ New Rule</Link>
        <Link href="/strategy" className="btn btn-ghost">⚙ Settings</Link>
      </div>

      {/* Bot status card */}
      {strategy && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Bot Status</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className={`badge ${strategy.bot_enabled ? 'badge-green' : 'badge-red'}`}>
                  {strategy.bot_enabled ? 'Active' : 'Stopped'}
                </span>
                <span className={`badge ${strategy.paper_mode ? 'badge-amber' : 'badge-red'}`}>
                  {strategy.paper_mode ? 'Paper' : 'LIVE'}
                </span>
                {jobs?.scheduler_running && <span className="badge badge-blue">Scheduler on</span>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 24px', fontSize: 12, color: 'var(--text2)' }}>
              <div>Max bet<br /><strong style={{ color: 'var(--text)' }}>${(strategy.max_position_cents / 100).toFixed(2)}</strong></div>
              <div>Daily limit<br /><strong style={{ color: 'var(--text)' }}>${(strategy.daily_loss_limit_cents / 100).toFixed(2)}</strong></div>
              <div>Max spread<br /><strong style={{ color: 'var(--text)' }}>{strategy.max_spread}¢</strong></div>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* Recent rule runs */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">Recent Rule Runs</div>
            <Link href="/activity" style={{ fontSize: 11, color: 'var(--text2)' }}>View all →</Link>
          </div>
          {runs.length === 0 ? (
            <div className="empty">No runs yet. Enable a rule and click Run.</div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>Rule</th><th>Status</th><th>Trades</th><th>Time</th>
              </tr></thead>
              <tbody>
                {runs.slice(0, 6).map((r: any) => {
                  const result = r?.result ?? {}
                  const allowed = result?.allowed === true
                  const tradesPlaced = Number(result?.paper_orders_created ?? 0)

                  const createdAtEpochSec = Number(r?.created_at)
                  const timeStr =
                    Number.isFinite(createdAtEpochSec) && createdAtEpochSec > 0
                      ? new Date(createdAtEpochSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'

                  const ruleLabelFromId = String(r?.rule_id ?? '').slice(0, 8)
                  const ruleLabel = (r?.rule_name ?? ruleLabelFromId) || 'Rule'

                  return (
                    <tr key={String(r?.run_id ?? r?.id ?? r?.rule_id ?? 'run')}>
                      <td
                        style={{
                          color: 'var(--text)',
                          maxWidth: 120,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ruleLabel}
                      </td>
                      <td>
                        <span className={`badge ${allowed ? 'badge-green' : 'badge-red'} badge-dim`}>
                          {allowed ? 'ok' : 'error'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--accent)' }}>{tradesPlaced}</td>
                      <td style={{ color: 'var(--text2)' }}>{timeStr}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent paper orders */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">Recent Orders</div>
            <Link href="/orders/paper" style={{ fontSize: 11, color: 'var(--text2)' }}>View all →</Link>
          </div>
          {orders.length === 0 ? (
            <div className="empty">No paper orders yet.</div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>Market</th><th>Side</th><th>Price</th><th>Count</th>
              </tr></thead>
              <tbody>
                {orders.slice(0, 6).map((o, idx) => (
                  <tr
                    key={
                      String(o.id ?? `${o.ticker}-${o.side}-${o.price_cents}-${o.count}-${o.created_at}-${idx}`)
                    }
                  >
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 11 }}>
                      {o.ticker}
                    </td>
                    <td>
                      <span className={`badge ${o.side === 'yes' ? 'badge-green' : 'badge-red'}`}>{o.side.toUpperCase()}</span>
                    </td>
                    <td style={{ color: 'var(--accent)' }}>{o.price_cents}¢</td>
                    <td>{o.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
