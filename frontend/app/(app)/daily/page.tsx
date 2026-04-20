'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, apiAdmin, formatApiError, getApiBaseUrl, hasClientApiToken, isUserAuthMode } from '@/lib/api'

type HeadlineUsed = { title?: string; source?: string; published_at?: string }

type CategoryRotation =
  | {
      mode?: string
      category?: string
      utc_weekday?: string
      winner?: string
      scores?: Record<string, { pool_quality_score?: number; pool_size?: number }>
    }
  | undefined

type TodayPick = {
  ok: boolean
  day: string
  message?: string
  ticker: string | null
  title: string | null
  summary: string | null
  confidence: number | null
  market_implied_yes: number | null
  model_yes_probability: number | null
  confidence_score: number | null
  edge: number | null
  recommended_action: string | null
  reasoning: string | null
  category_scanned?: string
  category_rotation?: CategoryRotation
  pick: {
    lean?: string
    used_claude?: boolean
    disclaimer?: string
    headlines_used?: HeadlineUsed[]
    category_scanned?: string
    category_rotation?: CategoryRotation
    analysis?: {
      model_yes_probability?: number
      implied_yes_probability?: number
      confidence?: number
      confidence_label?: string
      rationale?: string
      reasoning?: string
      ticker?: string
      claude?: { model?: string; raw_excerpt?: string }
    }
    selection?: { method?: string; pool_size?: number }
  } | null
  created_at: number | null
}

function actionBadge(action: string | null | undefined) {
  const a = (action || 'PASS').toUpperCase().replace(/-/g, '_')
  if (a === 'BUY_YES') {
    return {
      label: 'BUY YES',
      bg: 'linear-gradient(145deg, rgba(46,204,113,0.35) 0%, rgba(46,204,113,0.12) 100%)',
      border: 'rgba(46, 204, 113, 0.55)',
      color: '#5ee9a0',
      glow: '0 0 40px rgba(46,204,113,0.15)',
    }
  }
  if (a === 'BUY_NO') {
    return {
      label: 'BUY NO',
      bg: 'linear-gradient(145deg, rgba(255,77,106,0.35) 0%, rgba(255,77,106,0.1) 100%)',
      border: 'rgba(255, 77, 106, 0.5)',
      color: '#ff7a8c',
      glow: '0 0 36px rgba(255,77,106,0.12)',
    }
  }
  return {
    label: 'PASS',
    bg: 'var(--bg3)',
    border: 'var(--border2)',
    color: 'var(--text2)',
    glow: 'none',
  }
}

function normalizeAction(action: string | null | undefined): string {
  return (action || 'PASS').toUpperCase().replace(/-/g, '_').replace(/ /g, '_')
}

function edgeLine(
  edge: number | null | undefined,
  action: string | null | undefined,
): { color: string; text: string } {
  const act = normalizeAction(action)
  if (act === 'PASS') {
    return {
      color: 'var(--text2)',
      text: 'Edge is too small to act on — not enough conviction for a directional trade today.',
    }
  }
  if (edge == null || Number.isNaN(edge)) {
    return { color: 'var(--text2)', text: 'Edge: not enough to act on.' }
  }
  if (Math.abs(edge) < 0.1) {
    return {
      color: 'var(--text2)',
      text: 'Edge is too small to act on — not enough conviction for a directional trade today.',
    }
  }
  const pts = Math.round(Math.abs(edge) * 100)
  if (act === 'BUY_NO') {
    return {
      color: '#ff7a8c',
      text: `We see roughly ${pts}pp of downside vs. the market — lean NO.`,
    }
  }
  if (act === 'BUY_YES') {
    return {
      color: '#5ee9a0',
      text: `We see roughly ${pts}pp of upside vs. the market — lean YES.`,
    }
  }
  return {
    color: 'var(--text2)',
    text: 'Edge is too small to act on — not enough conviction for a directional trade today.',
  }
}

function RingGauge({
  label,
  valuePct,
  stroke,
  footnote,
}: {
  label: string
  valuePct: number
  stroke: string
  footnote?: string
}) {
  const v = Math.min(100, Math.max(0, valuePct))
  const r = 54
  const c = 2 * Math.PI * r
  const off = c - (v / 100) * c
  return (
    <div style={{ textAlign: 'center', flex: '1 1 200px', maxWidth: 280 }}>
      <div
        style={{
          fontSize: 10,
          color: 'var(--text3)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginBottom: 14,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
        <svg width={140} height={140} viewBox="0 0 140 140" style={{ display: 'block' }}>
          <circle cx={70} cy={70} r={r} fill="none" stroke="var(--border)" strokeWidth={9} opacity={0.9} />
          <circle
            cx={70}
            cy={70}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
            transform="rotate(-90 70 70)"
            style={{ filter: 'drop-shadow(0 0 8px rgba(0,229,160,0.12))' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, color: '#fff' }}>
            {v.toFixed(1)}
            <span style={{ fontSize: 16, color: 'var(--text3)', fontWeight: 700 }}>%</span>
          </span>
        </div>
      </div>
      {footnote ? (
        <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', lineHeight: 1.45 }}>{footnote}</p>
      ) : null}
    </div>
  )
}

function rotationSubtitle(data: TodayPick): string | null {
  const rot = data.pick?.category_rotation ?? data.category_rotation
  if (!rot || typeof rot !== 'object') return null
  if (rot.mode === 'sunday_tournament' && rot.winner) {
    const sc = rot.scores
    const parts =
      sc && typeof sc === 'object'
        ? Object.entries(sc)
            .map(([k, v]) => `${k}: ${(v?.pool_quality_score ?? 0).toFixed(1)}`)
            .join(' · ')
        : ''
    return `Sunday tournament → ${rot.winner}${parts ? ` (${parts})` : ''}`
  }
  if (rot.mode === 'weekday_rotation' && rot.utc_weekday && rot.category) {
    return `${rot.utc_weekday} · scanning ${rot.category}`
  }
  if (rot.mode === 'env_override' && rot.category) {
    return `Category override · ${rot.category}`
  }
  return data.pick?.category_scanned ?? data.category_scanned ?? null
}

export default function DailyPickPage() {
  const [data, setData] = useState<TodayPick | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [genLoading, setGenLoading] = useState(false)
  const [genErr, setGenErr] = useState('')
  const [liveKalshiPct, setLiveKalshiPct] = useState<number | null>(null)

  useEffect(() => {
    let c = false
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const r = await api.get<TodayPick>('/api/v1/daily-picks/today')
        if (!c) setData(r)
      } catch (e: unknown) {
        if (!c) setErr(formatApiError(e))
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [])

  useEffect(() => {
    const t = data?.ticker
    if (!t || !data?.ok) return
    let cancelled = false
    ;(async () => {
      try {
        const m = await api.get<Record<string, unknown>>(`/api/v1/markets/${encodeURIComponent(t)}`)
        const row = (typeof m.market === 'object' && m.market ? (m.market as Record<string, unknown>) : m) as Record<
          string,
          unknown
        >
        const bidRaw = row.yes_bid_dollars ?? row.yes_bid ?? null
        const askRaw = row.yes_ask_dollars ?? row.yes_ask ?? null
        const bid = Number(bidRaw ?? Number.NaN)
        const ask = Number(askRaw ?? Number.NaN)
        let mid = Number.NaN
        if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
          mid = (bid + ask) / 2
        } else {
          mid = Number(row.price_dollars ?? row.market_yes_probability ?? NaN)
        }
        if (!cancelled && Number.isFinite(mid) && mid >= 0 && mid <= 1.2) {
          setLiveKalshiPct(mid * 100)
        }
      } catch {
        /* live quote optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data?.ok, data?.ticker])

  if (!isUserAuthMode()) {
    return (
      <div className="fade-in">
        <p style={{ color: 'var(--text2)' }}>Daily picks are available when the app runs in account mode (NEXT_PUBLIC_USER_AUTH=1).</p>
        <Link href="/dashboard">Dashboard</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ color: 'var(--text3)', fontSize: 13, letterSpacing: '0.06em' }} className="fade-in">
        Loading intelligence…
      </div>
    )
  }

  if (err) {
    return (
      <div className="card" style={{ borderColor: 'rgba(255,77,106,0.35)', background: 'var(--red-bg)' }}>
        <p style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>
      </div>
    )
  }

  if (!data?.ok || !data.pick) {
    const curlHint = `curl -sS -X POST "${getApiBaseUrl()}/api/v1/daily-picks/generate" \\\n  -H "Authorization: Bearer $KALSHIBOT_API_TOKEN"`
    return (
      <div className="fade-in daily-page">
        <div className="daily-hero-title" style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 13, color: 'var(--text3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            Daily pick
          </h1>
          <p style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>Nothing published for today yet</p>
        </div>
        <div
          className="card"
          style={{
            background: 'linear-gradient(165deg, rgba(245,166,35,0.08) 0%, var(--bg2) 40%)',
            borderColor: 'rgba(245,166,35,0.35)',
          }}
        >
          <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.55 }}>{data?.message ?? 'No pick has been generated for this UTC day.'}</p>
          <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 14, lineHeight: 1.55 }}>
            Server needs <strong>Kalshi</strong> credentials and <code style={{ fontSize: 11 }}>KALSHIBOT_API_TOKEN</code>. For the analyst pick, add{' '}
            <code style={{ fontSize: 11 }}>ANTHROPIC_API_KEY</code> and <code style={{ fontSize: 11 }}>NEWS_API_KEY</code>.
          </p>
          {hasClientApiToken() && (
            <div style={{ marginTop: 18 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={genLoading}
                onClick={async () => {
                  setGenLoading(true)
                  setGenErr('')
                  try {
                    await apiAdmin.post('/api/v1/daily-picks/generate')
                    const r = await api.get<TodayPick>('/api/v1/daily-picks/today')
                    setData(r)
                  } catch (e: unknown) {
                    setGenErr(formatApiError(e))
                  } finally {
                    setGenLoading(false)
                  }
                }}
              >
                {genLoading ? 'Generating…' : 'Generate today’s pick'}
              </button>
              {genErr ? <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 10, lineHeight: 1.45 }}>{genErr}</p> : null}
            </div>
          )}
          <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: 16, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            Terminal:{'\n'}
            {curlHint}
          </p>
          {!hasClientApiToken() ? (
            <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: 8 }}>
              Tip: set <code style={{ fontSize: 10 }}>NEXT_PUBLIC_API_TOKEN</code> in <code style={{ fontSize: 10 }}>frontend/.env.local</code>.
            </p>
          ) : null}
        </div>
        <p style={{ marginTop: 22, fontSize: 13 }}>
          <Link href="/pricing" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            Upgrade to Pro
          </Link>{' '}
          for the full trading app when you&apos;re ready.
        </p>
      </div>
    )
  }

  const usedClaude = Boolean(data.pick.used_claude)
  const kalshiPct =
    data.market_implied_yes != null
      ? data.market_implied_yes * 100
      : (data.pick.analysis?.implied_yes_probability ?? 0) * 100
  const kalshiNowPct = liveKalshiPct ?? kalshiPct
  const wePct =
    data.model_yes_probability != null
      ? data.model_yes_probability * 100
      : (data.pick.analysis?.model_yes_probability ?? data.pick.analysis?.implied_yes_probability ?? 0) * 100
  const reasoning = (data.reasoning || data.pick.analysis?.reasoning || data.pick.analysis?.rationale || '').trim()
  const headlines: HeadlineUsed[] = Array.isArray(data.pick.headlines_used) ? data.pick.headlines_used : []
  const badge = actionBadge(data.recommended_action)
  const edge = edgeLine(data.edge, data.recommended_action)
  const cs = data.confidence_score
  const rotLine = rotationSubtitle(data)

  return (
    <div className="fade-in daily-page">
      <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 10, letterSpacing: '0.04em' }}>
        UTC <strong style={{ color: 'var(--text2)' }}>{data.day}</strong>
        {rotLine ? (
          <>
            {' '}
            · <span style={{ color: 'var(--accent)' }}>{rotLine}</span>
          </>
        ) : null}
      </p>

      <h1 className="daily-market-title">{data.title}</h1>
      <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 28 }}>{data.ticker}</div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '14px 36px',
            borderRadius: 12,
            border: `1px solid ${badge.border}`,
            background: badge.bg,
            color: badge.color,
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: '0.06em',
            boxShadow: badge.glow,
            fontFamily: 'var(--font-display)',
          }}
        >
          {badge.label}
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 22,
          background: 'linear-gradient(180deg, rgba(19,25,32,0.9) 0%, var(--bg2) 100%)',
          borderColor: 'var(--border2)',
          padding: '28px 24px 32px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, justifyContent: 'center', alignItems: 'flex-start' }}>
          <RingGauge
            label="Kalshi (live)"
            valuePct={kalshiNowPct}
            stroke="var(--accent)"
            footnote={`At analysis: ${kalshiPct.toFixed(1)}% · refreshes on load`}
          />
          <RingGauge label="We think (model)" valuePct={wePct} stroke="var(--blue)" footnote={usedClaude ? 'Research-weighted view' : 'Baseline — add Claude for depth'} />
        </div>
        <p style={{ marginTop: 22, fontSize: 14, color: edge.color, lineHeight: 1.55, textAlign: 'center', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
          {edge.text}
        </p>
      </div>

      {cs != null && usedClaude ? (
        <div className="card" style={{ marginBottom: 22, padding: '18px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', fontWeight: 700, textTransform: 'uppercase' }}>Confidence</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#fff' }}>{cs}/100</span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 6,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, cs))}%`,
                borderRadius: 5,
                background: 'linear-gradient(90deg, var(--accent2), var(--accent))',
                boxShadow: '0 0 16px rgba(0,229,160,0.25)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      ) : null}

      {reasoning ? (
        <div className="card" style={{ marginBottom: 22, padding: '22px 24px', borderColor: 'rgba(0,229,160,0.12)' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>Thesis</div>
          <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{reasoning}</p>
        </div>
      ) : null}

      {headlines.length > 0 ? (
        <details className="daily-collapsible">
          <summary>Headlines &amp; sources ({headlines.length})</summary>
          <ul>
            {headlines.map((h, i) => (
              <li key={i}>
                <span className="daily-headline-meta">
                  {h.source || 'Unknown'}
                  {h.published_at ? ` · ${h.published_at}` : ''}
                </span>
                {h.title}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div
        className="card"
        style={{ background: 'var(--bg3)', borderColor: 'var(--border)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.55 }}
      >
        {data.pick.disclaimer ??
          'Educational only. Not financial advice. Prediction markets can lose your entire stake. Past picks do not predict future results.'}
      </div>

      <p style={{ marginTop: 24, fontSize: 13 }}>
        <Link href="/pricing" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          Upgrade to Pro
        </Link>{' '}
        for the full app when you&apos;re ready.
      </p>
    </div>
  )
}
