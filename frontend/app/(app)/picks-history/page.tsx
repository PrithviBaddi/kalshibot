'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, formatApiError, isUserAuthMode } from '@/lib/api'

type HistoryPick = {
  day: string
  title: string
  ticker: string
  recommended_action: string | null
  model_yes_probability: number | null
  market_implied_yes: number | null
  edge: number | null
  resolved: boolean | null
  resolution_correct: boolean | null
  resolved_at: number | null
  context_sources_used: string[] | null
  resolution_result?: string | null
}

type HistoryResponse = {
  ok: boolean
  picks: HistoryPick[]
  stats?: { resolved_in_window: number; correct_in_window: number }
}

type AccuracyResponse = {
  ok: boolean
  total_picks: number
  total_resolved: number
  pass_picks_excluded: number
  non_pass_resolved_count: number
  correct: number
  incorrect: number
  accuracy_percent: number | null
  by_recommended_action: {
    BUY_YES: { resolved: number; correct: number; incorrect: number }
    BUY_NO: { resolved: number; correct: number; incorrect: number }
  }
}

function actionLabel(a: string | null | undefined): string {
  const x = (a || 'PASS').toUpperCase().replace(/-/g, '_').replace(/ /g, '_')
  if (x === 'BUY_YES') return 'BUY YES'
  if (x === 'BUY_NO') return 'BUY NO'
  return 'PASS'
}

function actionColor(a: string | null | undefined): string {
  const x = (a || 'PASS').toUpperCase().replace(/-/g, '_').replace(/ /g, '_')
  if (x === 'BUY_YES') return '#5ee9a0'
  if (x === 'BUY_NO') return '#ff7a8c'
  return 'var(--text3)'
}

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Math.round(n * 1000) / 10}%`
}

function AccuracyRing({ percent, display }: { percent: number | null; display: string }) {
  const r = 54
  const c = 2 * Math.PI * r
  const v = percent == null ? 0 : Math.min(100, Math.max(0, percent))
  const off = c - (v / 100) * c
  const stroke = percent == null ? 'var(--border2)' : 'var(--accent)'
  return (
    <div className="accuracy-ring-svg" aria-hidden>
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ display: 'block' }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke="var(--border)" strokeWidth={9} />
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
          opacity={percent == null ? 0.35 : 1}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: '#fff' }}>{display}</span>
      </div>
    </div>
  )
}

function ResolutionCell({ pick }: { pick: HistoryPick }) {
  const act = (pick.recommended_action || 'PASS').toUpperCase().replace(/-/g, '_').replace(/ /g, '_')
  if (pick.resolved !== true) {
    return (
      <span style={{ color: 'var(--text3)', fontSize: 13, fontWeight: 600 }}>
        Pending
      </span>
    )
  }
  if (act === 'PASS') {
    return (
      <span style={{ color: 'var(--text3)', fontSize: 13, fontWeight: 600 }}>
        PASS
      </span>
    )
  }
  if (pick.resolution_correct === true) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: '#5ee9a0',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 16 }}>●</span> Correct
      </span>
    )
  }
  if (pick.resolution_correct === false) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: '#ff7a8c',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 16 }}>●</span> Wrong
      </span>
    )
  }
  return <span style={{ color: 'var(--text3)', fontSize: 13 }}>—</span>
}

export default function PicksHistoryPage() {
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isUserAuthMode()) {
      setErr('Pick history requires multi-user mode.')
      setLoading(false)
      return
    }
    let c = false
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const [h, a] = await Promise.all([
          api.get<HistoryResponse>('/api/v1/daily-picks/history'),
          api.get<AccuracyResponse>('/api/v1/daily-picks/accuracy'),
        ])
        if (!c) {
          setData(h)
          setAccuracy(a)
        }
      } catch (e) {
        if (!c) setErr(formatApiError(e))
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [])

  const showAccuracyPct = accuracy && accuracy.non_pass_resolved_count >= 5 && accuracy.accuracy_percent != null

  if (loading) {
    return (
      <div style={{ color: 'var(--text3)', fontSize: 14 }} className="fade-in">
        Loading performance…
      </div>
    )
  }

  if (err) {
    return (
      <div>
        <p style={{ color: 'var(--red)', fontSize: 14, marginBottom: 16 }}>{err}</p>
        <Link href="/daily" style={{ color: 'var(--accent)', fontSize: 14 }}>
          ← Back to today&apos;s pick
        </Link>
      </div>
    )
  }

  const picks = data?.picks ?? []
  const yesBr = accuracy?.by_recommended_action?.BUY_YES
  const noBr = accuracy?.by_recommended_action?.BUY_NO

  const ringDisplay = showAccuracyPct ? `${accuracy!.accuracy_percent}%` : '—'
  const ringPct = showAccuracyPct ? accuracy!.accuracy_percent! : null

  return (
    <div className="fade-in" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/daily" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
          ← Today&apos;s pick
        </Link>
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, margin: '0 0 10px', color: '#fff', letterSpacing: '-0.03em' }}>
        Performance
      </h1>
      <p style={{ color: 'var(--text2)', fontSize: 14, maxWidth: 560, lineHeight: 1.55, marginBottom: 28 }}>
        Global daily picks with automatic settlement tracking. Green / red when scored; gray when pending or PASS.
      </p>

      {accuracy && accuracy.ok && (
        <div className="accuracy-ring-wrap">
          <div style={{ position: 'relative' }}>
            <AccuracyRing percent={ringPct} display={ringDisplay} />
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <div className="accuracy-ring-label">Calibration</div>
            {!showAccuracyPct ? (
              <div className="accuracy-ring-value" style={{ fontSize: 22, color: 'var(--text2)', marginBottom: 4 }}>
                Awaiting data
              </div>
            ) : null}
            <p className="accuracy-ring-sub">
              <strong style={{ color: 'var(--text)' }}>{accuracy.total_picks}</strong> picks ·{' '}
              <strong style={{ color: 'var(--text)' }}>{accuracy.total_resolved}</strong> resolved ·{' '}
              <strong style={{ color: 'var(--text)' }}>{accuracy.pass_picks_excluded}</strong> PASS excluded from score
            </p>
            {!showAccuracyPct ? (
              <p className="accuracy-ring-sub" style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>
                Accuracy ring fills after <strong>5</strong> non-PASS resolutions ({accuracy.non_pass_resolved_count} now).
              </p>
            ) : (
              <p className="accuracy-ring-sub" style={{ marginTop: 4, fontSize: 12 }}>
                {accuracy.correct} correct · {accuracy.incorrect} incorrect (BUY_YES + BUY_NO only)
              </p>
            )}
          </div>
        </div>
      )}

      {yesBr && noBr && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg2)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>BUY YES</div>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>
              <span style={{ color: '#5ee9a0', fontWeight: 700 }}>{yesBr.correct}</span> right ·{' '}
              <span style={{ color: '#ff7a8c', fontWeight: 700 }}>{yesBr.incorrect}</span> wrong · {yesBr.resolved} scored
            </div>
          </div>
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg2)',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>BUY NO</div>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>
              <span style={{ color: '#5ee9a0', fontWeight: 700 }}>{noBr.correct}</span> right ·{' '}
              <span style={{ color: '#ff7a8c', fontWeight: 700 }}>{noBr.incorrect}</span> wrong · {noBr.resolved} scored
            </div>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2)' }}>
        <table className="table-zebra" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: 10, letterSpacing: '0.08em' }}>Date (UTC)</th>
              <th style={{ padding: '12px 14px', minWidth: 220, fontSize: 10, letterSpacing: '0.08em' }}>Market</th>
              <th style={{ padding: '12px 14px', fontSize: 10, letterSpacing: '0.08em' }}>Action</th>
              <th style={{ padding: '12px 14px', fontSize: 10, letterSpacing: '0.08em' }}>Model P(YES)</th>
              <th style={{ padding: '12px 14px', fontSize: 10, letterSpacing: '0.08em' }}>Kalshi @ analysis</th>
              <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, letterSpacing: '0.08em' }}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {picks.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 28, color: 'var(--text2)' }}>
                  No picks stored yet.
                </td>
              </tr>
            )}
            {picks.map(p => (
              <tr key={p.day} style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', verticalAlign: 'middle', color: 'var(--text2)' }}>{p.day}</td>
                <td style={{ padding: '12px 14px', verticalAlign: 'middle', lineHeight: 1.45 }}>{p.title}</td>
                <td style={{ padding: '12px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontWeight: 600, color: actionColor(p.recommended_action) }}>
                  {actionLabel(p.recommended_action)}
                </td>
                <td style={{ padding: '12px 14px', verticalAlign: 'middle', color: 'var(--text2)' }}>{pct(p.model_yes_probability)}</td>
                <td style={{ padding: '12px 14px', verticalAlign: 'middle', color: 'var(--text2)' }}>{pct(p.market_implied_yes)}</td>
                <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                  <ResolutionCell pick={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
