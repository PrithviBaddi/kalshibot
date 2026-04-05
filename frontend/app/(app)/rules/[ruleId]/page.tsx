'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, Rule, formatApiError } from '@/lib/api'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'

export default function RuleEditPage() {
  const params = useParams()
  const router = useRouter()
  const ruleId = params.ruleId as string
  const [rule, setRule] = useState<Rule | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get<{ rule: Rule }>(`/api/v1/rules/${ruleId}`)
      .then(d => setRule(d.rule))
      .catch((e: unknown) => setError(formatApiError(e)))
      .finally(() => setLoading(false))
  }, [ruleId])

  async function save() {
    if (!rule) return
    setSaving(true); setError('')
    try {
      await api.put(`/api/v1/rules/${ruleId}`, rule)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) { setError(formatApiError(e)) }
    finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: 48, color: 'var(--text2)' }}>Loading rule...</div>
  if (!rule) return <div style={{ padding: 48, color: 'var(--red)' }}>{error || 'Rule not found'}</div>

  return (
    <div className="fade-in" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>← Rules</button>
      </div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Edit Rule</h1>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{ruleId}</div>
      </div>

      {error && <ApiErrorBanner message={error} onDismiss={() => setError('')} />}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Name</div>
        <input value={rule.name} onChange={e => setRule(r => r ? { ...r, name: e.target.value } : r)} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Enabled</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>When off, this rule will not run even when the scheduler fires.</div>
          </div>
          <button className={`toggle ${rule.enabled ? 'on' : ''}`}
            onClick={() => setRule(r => r ? { ...r, enabled: !r.enabled } : r)} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Config</div>
        {Object.entries(rule.config).map(([k, v]) => (
          <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{k}</div>
            <input
              value={typeof v === 'object' ? JSON.stringify(v) : String(v)}
              style={{ width: 200, textAlign: 'right', fontSize: 12 }}
              onChange={e => {
                const raw = e.target.value
                let parsed: unknown = raw
                try { parsed = JSON.parse(raw) } catch {}
                setRule(r => r ? { ...r, config: { ...r.config, [k]: parsed } } : r)
              }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '◌ Saving...' : '✓ Save Changes'}
        </button>
        {saved && <span style={{ color: 'var(--accent)', fontSize: 12 }}>Saved</span>}
        <button className="btn btn-ghost" onClick={() => router.push('/rules')}>Cancel</button>
      </div>
    </div>
  )
}
