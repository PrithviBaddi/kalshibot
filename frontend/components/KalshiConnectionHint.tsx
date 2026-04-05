'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, StatusResponse } from '@/lib/api'

/**
 * Shown when Kalshi credentials are missing on the server — one lightweight GET /api/v1/status per mount.
 */
export function KalshiConnectionHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get<StatusResponse>('/api/v1/status')
      .then((s) => {
        if (!cancelled) setShow(s.kalshi_configured === false)
      })
      .catch(() => {
        if (!cancelled) setShow(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!show) return null

  return (
    <div
      className="card"
      style={{
        marginBottom: 20,
        background: 'var(--amber-bg)',
        borderColor: 'rgba(245,166,35,0.35)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--amber)' }}>
        Kalshi is not connected on the server
      </div>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
        Add <code style={{ fontSize: 11 }}>KALSHI_API_KEY_ID</code> and your RSA key to the backend{' '}
        <code style={{ fontSize: 11 }}>.env</code>, then restart the API. Until then, balances and live quotes will show
        &quot;—&quot; and some features stay limited.
      </p>
      <Link href="/strategy" className="btn btn-ghost btn-sm" style={{ display: 'inline-block' }}>
        Open settings
      </Link>
    </div>
  )
}
