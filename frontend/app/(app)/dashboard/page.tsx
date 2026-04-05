'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Strategy, Rule, RuleRun, PaperOrder, JobsStatus, StatusResponse, PaperPnlResponse, AnalysisSnapshotRow, formatApiError } from '@/lib/api'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { KalshiConnectionHint } from '@/components/KalshiConnectionHint'

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [runs, setRuns] = useState<RuleRun[]>([])
  const [orders, setOrders] = useState<PaperOrder[]>([])
  const [paperPnl, setPaperPnl] = useState<PaperPnlResponse | null>(null)
  const [jobs, setJobs] = useState<JobsStatus | null>(null)
  const [analysisSnaps, setAnalysisSnaps] = useState<AnalysisSnapshotRow[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  async function load() {
    try {
      const [s, d, runsD, pnlD, j, snaps] = await Promise.all([
        api.get<StatusResponse>('/api/v1/status'),
        api.get<{ strategy: Strategy }>('/api/v1/dashboard/strategy'),
        api.get<{ rule_runs: RuleRun[] }>('/api/v1/dashboard/rule-runs?limit=10'),
        api.get<PaperPnlResponse>('/api/v1/dashboard/paper-pnl?limit=150'),
        api.get<{ rules: Rule[] }>('/api/v1/dashboard/rules'),
        api.get<{ snapshots: AnalysisSnapshotRow[] }>('/api/v1/dashboard/analysis-recent?limit=12'),
      ])
      setStatus(s)
      setStrategy(d.strategy)
      setRuns(runsD.rule_runs ?? [])
      setPaperPnl(pnlD)
      setOrders(pnlD.orders ?? [])
      setRules(j.rules ?? [])
      setAnalysisSnaps(snaps.snapshots ?? [])
    } catch (e: unknown) {
      setError(formatApiError(e))
    } finally { setLoaded(true) }
  }

  useEffect(() => { load() }, [])

  async function runAll() {
    setRunning(true)
    try {
      await api.post('/api/v1/jobs/run-all-enabled-once')
      await load()
    } catch (e: unknown) { setError(formatApiError(e)) }
    finally { setRunning(false) }
  }

  const pnlSummary = paperPnl?.summary
  const totalUnrealized = pnlSummary?.total_unrealized_pnl_dollars ?? null
  const totalCostDollars = pnlSummary != null ? pnlSummary.total_cost_cents / 100 : null
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

      <KalshiConnectionHint />

      {error && <ApiErrorBanner message={error} onDismiss={() => setError('')} />}

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Kalshi Balance</div>
          <div className="stat-value text-accent">${status?.balance_dollars ?? '—'}</div>
          <div className="stat-sub">{status?.kalshi_configured ? 'Connected' : 'Not connected'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Paper unrealized P&amp;L</div>
          <div
            className="stat-value"
            style={{
              color:
                totalUnrealized == null
                  ? 'var(--text)'
                  : totalUnrealized > 0
                    ? 'var(--accent)'
                    : totalUnrealized < 0
                      ? 'var(--red)'
                      : 'var(--text)',
            }}
          >
            {totalUnrealized == null ? '—' : `${totalUnrealized >= 0 ? '+' : ''}$${totalUnrealized.toFixed(2)}`}
          </div>
          <div className="stat-sub">
            {paperPnl?.kalshi_configured === false
              ? 'Connect Kalshi API on server for live marks'
              : `${orders.length} paper orders · cost $${totalCostDollars != null ? totalCostDollars.toFixed(2) : '—'}`}
          </div>
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

      {/* Recent analysis snapshots (extension + market page) */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-header">
          <div className="section-title">Recent analysis</div>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Saved when you run analysis</span>
        </div>
        {analysisSnaps.length === 0 ? (
          <div className="empty">
            No analysis history yet. Run <strong>Analysis</strong> on a{' '}
            <Link href="/markets" style={{ color: 'var(--accent)' }}>market page</Link>
            {' '}or use the Chrome extension on kalshi.com — results appear here automatically.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Model P(YES)</th>
                <th>Edge</th>
                <th>Conf</th>
                <th>Source</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {analysisSnaps.map((snap) => {
                const a = snap.analysis
                const model = typeof a?.model_yes_probability === 'number' ? a.model_yes_probability : null
                const edge = typeof a?.edge_vs_market_yes === 'number' ? a.edge_vs_market_yes : null
                const conf = typeof a?.confidence === 'number' ? a.confidence : null
                const tsec = Number(snap.created_at)
                const timeStr =
                  Number.isFinite(tsec) && tsec > 0
                    ? new Date(tsec * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—'
                const label = snap.title?.trim() || snap.ticker
                return (
                  <tr key={snap.id}>
                    <td style={{ maxWidth: 200 }}>
                      <Link
                        href={`/markets/${encodeURIComponent(snap.ticker)}`}
                        style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700, wordBreak: 'break-word' }}
                      >
                        {label.length > 72 ? `${label.slice(0, 72)}…` : label}
                      </Link>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {model == null ? '—' : `${(model * 100).toFixed(1)}%`}
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color:
                          edge == null ? 'var(--text3)' : edge > 0 ? 'var(--accent)' : edge < 0 ? 'var(--red)' : 'var(--text2)',
                      }}
                    >
                      {edge == null ? '—' : `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)} pp`}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {conf == null ? '—' : `${(conf * 100).toFixed(0)}%`}
                    </td>
                    <td>
                      <span className={`badge ${snap.claude_enriched ? 'badge-green' : 'badge-dim'} badge-dim`} style={{ marginRight: 4 }}>
                        {snap.claude_enriched ? 'Claude' : 'baseline'}
                      </span>
                      {snap.news_fetched && (
                        <span className="badge badge-blue badge-dim">news</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 11 }}>{timeStr}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid-2">
        {/* Recent rule runs */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">Recent Rule Runs</div>
            <Link href="/activity" style={{ fontSize: 11, color: 'var(--text2)' }}>View all →</Link>
          </div>
          {runs.length === 0 ? (
            <div className="empty">
              No scheduler runs yet. Create a rule, enable it, then use <strong>Run All Rules Now</strong> above or run once from{' '}
              <Link href="/rules" style={{ color: 'var(--accent)' }}>Rules</Link>.
            </div>
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
            <div className="empty">
              No simulated fills yet. Paper orders come from the{' '}
              <Link href="/scanner" style={{ color: 'var(--accent)' }}>scanner</Link>
              {' '}(extension),{' '}
              <Link href="/rules" style={{ color: 'var(--accent)' }}>rules</Link>, or manual tests — not from live Kalshi trades.
            </div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>Market</th><th>Side</th><th>Entry</th><th>Count</th><th>Unrealized</th>
              </tr></thead>
              <tbody>
                {orders.slice(0, 6).map((o, idx) => {
                  const m = o.mtm
                  const u = m?.ok ? m.unrealized_pnl_dollars : null
                  return (
                  <tr
                    key={
                      String(o.id ?? `${o.ticker}-${o.side}-${o.price_cents}-${o.count}-${o.created_at}-${idx}`)
                    }
                  >
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 11 }}>
                      {(m?.ok && m.market_title) ? m.market_title : o.ticker}
                    </td>
                    <td>
                      <span className={`badge ${o.side === 'yes' ? 'badge-green' : 'badge-red'}`}>{o.side.toUpperCase()}</span>
                    </td>
                    <td style={{ color: 'var(--accent)' }}>{o.price_cents}¢</td>
                    <td>{o.count}</td>
                    <td style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: u == null ? 'var(--text3)' : u > 0 ? 'var(--accent)' : u < 0 ? 'var(--red)' : 'var(--text2)',
                    }}>
                      {u == null ? '—' : `${u >= 0 ? '+' : ''}$${u.toFixed(2)}`}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
