'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Rule } from '@/lib/api'

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [running, setRunning] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<{ id: string; msg: string } | null>(null)

  function ruleIdOf(rule: any): string {
    // Backend `/api/v1/rules` returns `id` (not `rule_id`) in SQLite layer.
    return String(rule?.rule_id ?? rule?.id ?? '')
  }

  async function load() {
    try {
      const d = await api.get<{ rules: Rule[] }>('/api/v1/rules')
      setRules(d.rules ?? [])
    } catch(e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function toggleEnabled(rule: Rule) {
    const ruleId = ruleIdOf(rule as any)
    if (!ruleId) return
    try {
      await api.put(`/api/v1/rules/${ruleId}`, { ...rule, enabled: !rule.enabled })
      await load()
    } catch(e: any) { setError(e.message) }
  }

  async function runOnce(rule: Rule) {
    const ruleId = ruleIdOf(rule as any)
    if (!ruleId) return

    setRunning(ruleId)
    setRunResult(null)
    try {
      const r = await api.post<{ status: string; trades_placed?: number }>(
        `/api/v1/rules/${ruleId}/run-once`,
      )
      setRunResult({
        id: ruleId,
        msg: `Done — ${r.trades_placed ?? 0} trade(s) placed`,
      })
    } catch(e: any) {
      setRunResult({ id: ruleId, msg: `Error: ${e.message}` })
    }
    finally { setRunning(null) }
  }

  return (
    <div className="fade-in">
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>Rules</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>
            Rules tell your bot which markets to trade and when. The bot runs all enabled rules automatically.
          </p>
        </div>
        <Link href="/rules/new" className="btn btn-primary">+ New Rule</Link>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: 'var(--red)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty">Loading rules...</div>
      ) : rules.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ padding: '40px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#fff', marginBottom: 8 }}>No rules yet</div>
            <div style={{ marginBottom: 16 }}>Create your first rule to tell the bot which markets to trade.</div>
            <Link href="/rules/new" className="btn btn-primary">Create first rule</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map(rule => {
            const ruleId = ruleIdOf(rule as any)
            const templateId = (rule as any)?.template_id ?? (rule as any)?.config?.template_id ?? ''
            return (
            <div key={ruleId || rule.name} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <button className={`toggle ${rule.enabled ? 'on' : ''}`}
                onClick={() => toggleEnabled(rule)} style={{ marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#fff' }}>
                    {rule.name}
                  </span>
                  <span className={`badge ${rule.enabled ? 'badge-green' : 'badge-dim'}`}>
                    {rule.enabled ? 'Active' : 'Disabled'}
                  </span>
                  {templateId ? <span className="badge badge-blue">{templateId}</span> : null}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                  ID: {ruleId || '—'}
                </div>
                {/* Config summary */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text2)' }}>
                  {Object.entries(rule.config).slice(0, 5).map(([k, v]) => (
                    <span key={k}><span style={{ color: 'var(--text3)' }}>{k}:</span> {String(v)}</span>
                  ))}
                </div>
                {runResult && runResult.id === ruleId && (
                  <div style={{ marginTop: 8, fontSize: 12, color: runResult.msg.startsWith('Error') ? 'var(--red)' : 'var(--accent)' }}>
                    {runResult.msg}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => runOnce(rule)} disabled={!ruleId || running === ruleId}>
                  {running === ruleId ? '◌' : '▶ Run once'}
                </button>
                {ruleId ? <Link href={`/rules/${ruleId}`} className="btn btn-ghost btn-sm">Edit</Link> : null}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
