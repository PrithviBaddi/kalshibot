'use client'
import { useEffect, useState } from 'react'
import { api, Strategy, formatApiError, isUserAuthMode } from '@/lib/api'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { KalshiConnectionHint } from '@/components/KalshiConnectionHint'

const DEFAULT: Strategy = {
  bot_enabled: false,
  paper_mode: true,
  max_position_cents: 1000,
  daily_loss_limit_cents: 5000,
  min_volume: 1000,
  max_spread: 0.1,
  notes: '',
  blocked_keywords: [],
  auto_exit_paper: false,
  paper_take_profit_cents: 5,
  paper_stop_loss_cents: 10,
  paper_exit_interval_seconds: 60,
}

export default function StrategyPage() {
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [kwInput, setKwInput] = useState('')
  const [kalshiKeyId, setKalshiKeyId] = useState('')
  const [kalshiPem, setKalshiPem] = useState('')
  const [kalshiMsg, setKalshiMsg] = useState('')
  const [kalshiSaving, setKalshiSaving] = useState(false)

  useEffect(() => {
    api.get<{ strategy: Strategy }>('/api/v1/dashboard/strategy')
      .then(d => {
        if (d.strategy) setStrategy(s => ({ ...DEFAULT, ...d.strategy }))
      })
      .catch((e: unknown) => setError(formatApiError(e)))
  }, [])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      await api.put('/api/v1/strategy', strategy)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) { setError(formatApiError(e)) }
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

  const SectionLabel = ({ text }: { text: string }) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>
      {text}
    </div>
  )

  const Toggle = ({ field, label, desc }: { field: 'bot_enabled' | 'paper_mode' | 'auto_exit_paper', label: string, desc: string }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{desc}</div>
      </div>
      <button
        type="button"
        className={`toggle ${strategy[field] ? 'on' : ''}`}
        onClick={() => set(field, !strategy[field])}
        aria-label={label}
      />
    </div>
  )

  const NumberField = ({ label, desc, field, unit, min, step = 1, dollarsFromCents }: {
    label: string
    desc: string
    field: keyof Strategy
    unit: string
    min?: number
    step?: number
    dollarsFromCents?: boolean
  }) => {
    const rawVal = strategy[field] as number
    const displayVal = dollarsFromCents ? (rawVal / 100).toFixed(2) : rawVal

    return (
      <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{desc}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {dollarsFromCents && <span style={{ color: 'var(--text2)', fontSize: 13 }}>$</span>}
            <input
              type="number"
              value={displayVal}
              min={min}
              step={step}
              style={{ width: 90, textAlign: 'right' }}
              onChange={e => {
                const v = parseFloat(e.target.value) || 0
                if (dollarsFromCents) {
                  set(field, Math.round(v * 100) as Strategy[typeof field])
                  return
                }
                if (field === 'paper_exit_interval_seconds') {
                  set('paper_exit_interval_seconds', Math.max(5, Math.round(v)))
                  return
                }
                set(field, v as Strategy[typeof field])
              }}
            />
            {!dollarsFromCents && <span style={{ color: 'var(--text2)', fontSize: 13 }}>{unit}</span>}
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

      <KalshiConnectionHint />

      {isUserAuthMode() && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>
            Kalshi API (your account)
          </div>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
            Paste your <strong>Kalshi API Key ID</strong> and <strong>RSA private key (PEM)</strong>. Keys are encrypted on the server. Create keys in Kalshi → Account → API Keys.
          </p>
          <label style={{ fontSize: 11, color: 'var(--text3)' }}>API Key ID</label>
          <input value={kalshiKeyId} onChange={e => setKalshiKeyId(e.target.value)} placeholder="UUID" style={{ width: '100%', marginBottom: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          <label style={{ fontSize: 11, color: 'var(--text3)' }}>Private key (PEM)</label>
          <textarea
            value={kalshiPem}
            onChange={e => setKalshiPem(e.target.value)}
            placeholder="-----BEGIN RSA PRIVATE KEY----- …"
            rows={6}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 10 }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={kalshiSaving}
            onClick={async () => {
              setKalshiSaving(true)
              setKalshiMsg('')
              try {
                await api.put('/api/v1/auth/kalshi-credentials', {
                  api_key_id: kalshiKeyId.trim(),
                  private_key_pem: kalshiPem.trim(),
                })
                setKalshiMsg('Saved. Refresh status in the sidebar.')
                setKalshiPem('')
              } catch (e: unknown) {
                setKalshiMsg(formatApiError(e))
              } finally {
                setKalshiSaving(false)
              }
            }}
          >
            {kalshiSaving ? 'Saving…' : 'Save Kalshi credentials'}
          </button>
          {kalshiMsg && <p style={{ marginTop: 10, fontSize: 12, color: kalshiMsg.startsWith('Saved') ? 'var(--accent)' : 'var(--red)' }}>{kalshiMsg}</p>}
        </div>
      )}

      {error && <ApiErrorBanner message={error} onDismiss={() => setError('')} />}

      <div className="card" style={{ marginBottom: 20 }}>
        <SectionLabel text="Bot Status" />
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

      <div className="card" style={{ marginBottom: 20 }}>
        <SectionLabel text="Risk Limits" />
        <NumberField
          label="Max bet size"
          desc="The most the bot can spend on any single trade. If a rule tries to place an order larger than this, it gets blocked."
          field="max_position_cents" unit="$" min={0.01} step={0.5} dollarsFromCents
        />
        <NumberField
          label="Daily loss limit"
          desc="Bot shuts itself off automatically for the rest of the day if total losses reach this amount. A safety net so a bad day can't wipe you out."
          field="daily_loss_limit_cents" unit="$" min={1} step={1} dollarsFromCents
        />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <SectionLabel text="Auto-exit settings" />

        <Toggle
          field="auto_exit_paper"
          label="Auto-exit paper trades"
          desc="When on, the server periodically checks open simulated positions and closes them at the current mid when per-contract unrealized P&amp;L hits your profit or loss thresholds (paper mode only)."
        />

        {strategy.auto_exit_paper && !strategy.paper_mode && (
          <div style={{ margin: '8px 0 0', background: 'var(--amber-bg)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--amber)' }}>
            Auto-exit only runs while paper mode is on.
          </div>
        )}

        <NumberField
          label="Auto sell when up"
          desc="Per contract: close when unrealized gain reaches this amount (vs your average entry). Shown in dollars; stored as cents on the server."
          field="paper_take_profit_cents" unit="per contract" min={0.01} step={0.01} dollarsFromCents
        />

        <NumberField
          label="Auto sell when down"
          desc="Per contract: close when unrealized loss reaches this amount vs entry."
          field="paper_stop_loss_cents" unit="per contract" min={0.01} step={0.01} dollarsFromCents
        />

        <NumberField
          label="Check positions every"
          desc="How often the exit monitor wakes up to evaluate open paper positions (seconds)."
          field="paper_exit_interval_seconds" unit="seconds" min={5} step={5}
        />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <SectionLabel text="Market Filters" />
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={addKeyword}>Add</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {strategy.blocked_keywords.map(kw => (
              <span key={kw} style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 4, padding: '3px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                {kw}
                <button type="button" onClick={() => removeKeyword(kw)}
                  style={{ background: 'none', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
            {strategy.blocked_keywords.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>None added</span>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <SectionLabel text="Notes" />
        <textarea
          value={strategy.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Personal notes about your strategy..."
          rows={3}
          style={{ resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '◌ Saving...' : '✓ Save Settings'}
        </button>
        {saved && <span style={{ color: 'var(--accent)', fontSize: 12 }}>Saved successfully</span>}
      </div>
    </div>
  )
}
