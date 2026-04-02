'use client'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

export default function ActivityPage() {
  type RuleRunRow = {
    id: number | string
    rule_id: number | string
    created_at: number | string
    result?: {
      allowed?: boolean
      paper_orders_created?: number
      started_at?: string
      finished_at?: string
      duration_ms?: number
      error?: string
    }
  }

  const [runs, setRuns] = useState<RuleRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [ruleNameById, setRuleNameById] = useState<Record<string, string>>({})

  const rows = useMemo(() => {
    return runs.map((r) => {
      const result = r.result ?? {}
      const allowed = result.allowed === true
      const tradesPlaced = Number(result.paper_orders_created ?? 0)

      const startEpochSec = Number(r.created_at)
      const startDate = Number.isFinite(startEpochSec) ? new Date(startEpochSec * 1000) : null

      const startTime = startDate
        ? startDate.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—'

      let duration = '—'
      if (result.started_at && result.finished_at) {
        const ms = Date.parse(result.finished_at) - Date.parse(result.started_at)
        if (Number.isFinite(ms) && ms >= 0) {
          duration = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
        }
      } else if (typeof result.duration_ms === 'number' && result.duration_ms >= 0) {
        const ms = result.duration_ms
        duration = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
      }

      const ruleName = ruleNameById[String(r.rule_id)] ?? `Rule ${r.rule_id}`

      return {
        runKey: String(r.id),
        ruleName,
        statusLabel: allowed ? 'ok' : 'error',
        statusClass: allowed ? 'badge-green' : 'badge-red',
        tradesPlaced,
        startTime,
        duration,
      }
    })
  }, [runs, ruleNameById])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [runsD, rulesD] = await Promise.all([
          api.get<{ rule_runs: RuleRunRow[] }>('/api/v1/dashboard/rule-runs?limit=50'),
          api.get<{ rules: Array<{ id: number | string; name?: string }> }>('/api/v1/dashboard/rules'),
        ])

        setRuns(runsD.rule_runs ?? [])

        const map: Record<string, string> = {}
        for (const rule of rulesD.rules ?? []) {
          if (rule?.id !== undefined) map[String(rule.id)] = rule.name ?? `Rule ${rule.id}`
        }
        setRuleNameById(map)
      } catch (e: any) {
        setError(e?.message ?? String(e))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Activity</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          All rule runs (latest first). Status reflects whether the run finished successfully.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: 'var(--red-bg)',
            border: '1px solid rgba(255,77,106,0.3)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            color: 'var(--red)',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty">Loading activity...</div>
      ) : runs.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ padding: '40px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>≡</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#fff', marginBottom: 8 }}>
              No activity yet
            </div>
            <div>Run a rule from the Rules page to see activity here.</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rule name</th>
                <th>Status</th>
                <th>Trades placed</th>
                <th>Start time</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.runKey}>
                  <td style={{ color: 'var(--text)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.ruleName}
                  </td>
                  <td>
                    <span className={`badge ${r.statusClass}`}>{r.statusLabel}</span>
                  </td>
                  <td style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{r.tradesPlaced}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{r.startTime}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{r.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
