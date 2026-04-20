'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, formatApiError } from '@/lib/api'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { KALSHI_SCAN_CATEGORIES } from '@/lib/kalshiCategories'

const TEMPLATES = [
  {
    id: 'safe-liquidity',
    label: 'Safe liquidity',
    desc: 'Only trade markets with high volume and tight spreads. Conservative, low-risk strategy.',
    defaults: { max_spread: 0.08, min_volume: 2000, top_n: 10, per_series_limit: 2, max_trades_per_run: 5 }
  },
]

const CATEGORIES = [...KALSHI_SCAN_CATEGORIES]

export default function NewRulePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('safe-liquidity')
  const [categories, setCategories] = useState<string[]>(['Politics'])
  const [config, setConfig] = useState(TEMPLATES[0].defaults as Record<string, number>)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const tpl = TEMPLATES.find(t => t.id === templateId)!

  function toggleCat(cat: string) {
    setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  async function save() {
    if (!name.trim()) { setError('Give your rule a name'); return }
    setSaving(true); setError('')
    try {
      await api.post('/api/v1/rules', {
        name: name.trim(),
        template_id: templateId,
        enabled: true,
        config: { ...config, categories },
      })
      router.push('/rules')
    } catch (e: unknown) { setError(formatApiError(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="fade-in" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>← Back</button>
      </div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>New Rule</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          A rule tells your bot which markets to scan and how to trade them automatically.
        </p>
      </div>

      {error && <ApiErrorBanner message={error} onDismiss={() => setError('')} />}

      {/* Rule name */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Rule name</div>
        <input placeholder="e.g. Politics scanner — conservative"
          value={name} onChange={e => setName(e.target.value)} />
      </div>

      {/* Template */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Strategy template</div>
        {TEMPLATES.map(t => (
          <div key={t.id} onClick={() => { setTemplateId(t.id); setConfig(t.defaults as any) }}
            style={{
              padding: '12px 14px', borderRadius: 6, border: `1px solid ${templateId === t.id ? 'var(--accent)' : 'var(--border2)'}`,
              background: templateId === t.id ? 'var(--accent-bg)' : 'var(--bg3)',
              cursor: 'pointer', marginBottom: 8
            }}>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 3 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* Categories */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Categories to scan</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>The bot will only look at markets in these categories.</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button key={cat}
              className={`btn btn-sm ${categories.includes(cat) ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => toggleCat(cat)}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Config sliders */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Risk parameters</div>

        {[
          { key: 'max_spread', label: 'Max price gap', unit: '(0–1)', desc: 'Skip markets where buy/sell gap exceeds this. Lower = safer.' },
          { key: 'min_volume', label: 'Min trading activity', unit: 'contracts', desc: 'Ignore markets with less than this many total trades.' },
          { key: 'top_n', label: 'Markets to consider per scan', unit: 'markets', desc: 'How many top-ranked markets to look at each time the rule runs.' },
          { key: 'max_trades_per_run', label: 'Max trades per run', unit: 'orders', desc: 'The most orders this rule can place in one execution. Limits exposure.' },
        ].map(({ key, label, unit, desc }) => (
          <div key={key} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{desc}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <input type="number" value={config[key]} step={key === 'max_spread' ? 0.01 : 1}
                  min={0}
                  style={{ width: 80, textAlign: 'right' }}
                  onChange={e => setConfig(c => ({ ...c, [key]: parseFloat(e.target.value) || 0 }))} />
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '◌ Saving...' : '✓ Create Rule'}
        </button>
        <button className="btn btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>
    </div>
  )
}
