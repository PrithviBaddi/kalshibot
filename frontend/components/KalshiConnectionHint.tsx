'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, StatusResponse, isUserAuthMode } from '@/lib/api'

/**
 * Shown when Kalshi is not reachable for the current deployment / account.
 * Refetches when the route changes (e.g. after saving keys on Settings).
 */
export function KalshiConnectionHint() {
  const pathname = usePathname()
  const [state, setState] = useState<{
    show: boolean
    userAuth?: boolean
    message?: string
  }>({ show: false })

  useEffect(() => {
    let cancelled = false
    api
      .get<StatusResponse>('/api/v1/status')
      .then((s) => {
        if (cancelled) return
        if (s.kalshi_configured) {
          setState({ show: false })
          return
        }
        setState({ show: true, userAuth: s.user_auth, message: s.message })
      })
      .catch(() => {
        if (!cancelled) setState({ show: false })
      })
    return () => {
      cancelled = true
    }
  }, [pathname])

  if (!state.show) return null

  const multi = state.userAuth === true || isUserAuthMode()

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
        Kalshi is not connected
      </div>
      {multi ? (
        <>
          <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
            {state.message ??
              'Add your Kalshi Trade API Key ID and RSA private key (PEM) under Settings or Setup. The server stores them encrypted per account.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Link href="/strategy" className="btn btn-ghost btn-sm" style={{ display: 'inline-block' }}>
              Settings
            </Link>
            <Link href="/onboarding" className="btn btn-ghost btn-sm" style={{ display: 'inline-block' }}>
              Setup guide
            </Link>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
            Add <code style={{ fontSize: 11 }}>KALSHI_API_KEY_ID</code> and your RSA key to the backend{' '}
            <code style={{ fontSize: 11 }}>.env</code>, then restart the API. Until then, balances and live quotes will show
            &quot;—&quot; and some features stay limited.
          </p>
          <Link href="/strategy" className="btn btn-ghost btn-sm" style={{ display: 'inline-block' }}>
            Open settings
          </Link>
        </>
      )}
    </div>
  )
}
