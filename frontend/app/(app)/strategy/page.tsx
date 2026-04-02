'use client'
import { useEffect, useState } from 'react'
import { api, Strategy } from '@/lib/api'

const DEFAULT: Strategy = {
  bot_enabled: false,
  paper_mode: true,
  max_position_cents: 1000,
  daily_loss_limit_cents: 5000,
  min_volume: 1000,
  max_spread: 0.1,
  notes: '',
  blocked_keywords: [],
}

export default function StrategyPage() {
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [kwInput, setKwInput] = useState('')

  useEffect(() => {
    api.get<{ strategy: Strategy }>('/api/v1/dashboard/strategy')
      .then(d => { if (d.strategy) setStrategy(d.strategy) })
      .catch(e => setError(e.message))
  }, [])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      await api.put('/api/v1/strategy', strategy)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch(e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  function set<K extends keyof Strategy>(k: K, v: Strategy[K]) {
    setStrategy(s => ({ ...s, [k]: v }))
  }

  function addKeyword() {
    const kw = kwInput.trim()
    if (!kw || strategy.blocked_keywords.includes(kw)) { setKwInput(''); return }
    set('blocked_keywords', [...strategy.blocked_keywords, kw])
    setKwInput('')
  }

  function removeKeyword(kw: string) {
    set('blocked_keywords', strategy.blocked_keywords.filter(k => k !== kw))
  }

  const Toggle = ({ field, label, desc }: { field: 'bot_enabled' | 'paper_mode', label: string, desc: string }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{desc}</div>
      </div>
      <button className={`toggle ${strategy[field] ? 'on' : ''}`}
        onClick={() => set(field, !strategy[field])} aria-label={label} />
    </div>
  )

  const NumberField = ({ label, desc, field, unit, min, step = 1 }: {
    label: string; desc: string; field: keyof Strategy; unit: string; min?: number; step?: number
  }) => {
    const rawVal = strategy[field] as number
    const displayVal = unit === '$' ? (rawVal / 100).toFixed(2) : rawVal

    return (
      <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{desc}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {unit === '$' && <span style={{ color: 'var(--text2)', fontSize: 13 }}>$</span>}
            <input
              type="number"
              value={displayVal}
              min={min}
              step={step}
              style={{ width: 90, textAlign: 'right' }}
              onChange={e => {
                const v = parseFloat(e.target.value) || 0
                set(field as any, unit === '$' ? Math.round(v * 100) : v)
              }}
            />
            {unit !== '$' && <span style={{ color: 'var(--text2)', fontSize: 13 }}>{unit}</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in" style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Settings</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>Configure your bot behavior and risk limits.</p>
      </div>

      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: 'var(--red)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Bot status section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>
          Bot Status
        </div>
        <Toggle field="bot_enabled" label="Bot enabled"
          desc="Master switch. Turn off to immediately stop all automated trading. Nothing runs while this is off." />
        <Toggle field="paper_mode" label="Paper mode"
          desc="When on, the bot simulates trades without spending real money. All order logic runs normally but nothing is sent to Kalshi. Recommended until you're confident in your strategy." />

        {!strategy.paper_mode && strategy.bot_enabled && (
          <div style={{ marginTop: 12, background: 'var(--red-bg)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>
            ⚠ LIVE TRADING IS ON — real money will be spent when rules trigger.
          </div>
        )}
      </div>

      {/* Risk limits */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>
          Risk Limits
        </div>
        <NumberField
          label="Max bet size"
          desc="The most the bot can spend on any single trade. If a rule tries to place an order larger than this, it gets blocked."
          field="max_position_cents" unit="$" min={0.01} step={0.5}
        />
        <NumberField
          label="Daily loss limit"
          desc="Bot shuts itself off automatically for the rest of the day if total losses reach this amount. A safety net so a bad day can't wipe you out."
          field="daily_loss_limit_cents" unit="$" min={1} step={1}
        />
      </div>

      {/* Market filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>
          Market Filters
        </div>
        <NumberField
          label="Minimum trading activity"
          desc="Skip markets with fewer total contracts traded than this. Low-activity markets are hard to enter and exit — you might get stuck. Recommended: 1000+"
          field="min_volume" unit="contracts" min={0} step={100}
        />
        <NumberField
          label="Max price gap"
          desc="Skip markets where the buy and sell price are too far apart. A big gap means you overpay just to enter the trade. Think of it like a bad currency exchange rate. Recommended: 0.10 or less."
          field="max_spread" unit="(0–1 scale)" min={0} step={0.01}
        />

        {/* Blocked keywords */}
        <div style={{ padding: '16px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Blocked market keywords</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
            Any market whose ticker contains these words will be skipped by the bot. Use this to block specific topics or series.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input placeholder="e.g. NBA, KXUFC, crypto..." value={kwInput}
              onChange={e => setKwInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKeyword()}
              style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={addKeyword}>Add</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {strategy.blocked_keywords.map(kw => (
              <span key={kw} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 4, padding: '3px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                {kw}
                <button onClick={() => removeKeyword(kw)}
                  style={{ background: 'none', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
            {strategy.blocked_keywords.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>None added</span>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
          Notes
        </div>
        <textarea
          value={strategy.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Personal notes about your strategy..."
          rows={3}
          style={{ resize: 'vertical' }}
        />
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '◌ Saving...' : '✓ Save Settings'}
        </button>
        {saved && <span style={{ color: 'var(--accent)', fontSize: 12 }}>Saved successfully</span>}
      </div>
    </div>
  )
}
