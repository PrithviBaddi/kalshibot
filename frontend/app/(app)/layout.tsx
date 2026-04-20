'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BrandLogo } from '@/components/BrandLogo'
import {
  api,
  AuthUser,
  StatusResponse,
  Strategy,
  getAccessToken,
  hasClientApiToken,
  isUserAuthMode,
  setAccessToken,
  userIsPro,
} from '@/lib/api'

function IconNav({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.9 }}>
      {children}
    </span>
  )
}

const NAV = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <IconNav>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 10L12 4l8 6v10H4V10z" strokeLinejoin="round" />
        </svg>
      </IconNav>
    ),
  },
  {
    href: '/scanner',
    label: 'Scanner',
    icon: (
      <IconNav>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" strokeLinecap="round" />
        </svg>
      </IconNav>
    ),
  },
  {
    href: '/markets',
    label: 'Markets',
    icon: (
      <IconNav>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 18V6M10 18V10M16 18v-5M22 18V8" strokeLinecap="round" />
        </svg>
      </IconNav>
    ),
  },
  {
    href: '/rules',
    label: 'Rules',
    icon: (
      <IconNav>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 4h12v16l-3-2-3 2-3-2-3 2V4z" strokeLinejoin="round" />
        </svg>
      </IconNav>
    ),
  },
  {
    href: '/orders/paper',
    label: 'Paper & P&L',
    icon: (
      <IconNav>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 16l4-4 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 8h4v4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </IconNav>
    ),
  },
  {
    href: '/activity',
    label: 'Activity',
    icon: (
      <IconNav>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" />
        </svg>
      </IconNav>
    ),
  },
  {
    href: '/strategy',
    label: 'Settings',
    icon: (
      <IconNav>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
        </svg>
      </IconNav>
    ),
  },
  {
    href: '/onboarding',
    label: 'Setup',
    icon: (
      <IconNav>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" strokeLinejoin="round" />
        </svg>
      </IconNav>
    ),
  },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [stopping, setStopping] = useState(false)
  const [hasJwt, setHasJwt] = useState(false)
  const [authProfile, setAuthProfile] = useState<AuthUser | null>(null)
  const [authProfileLoading, setAuthProfileLoading] = useState(false)

  useEffect(() => {
    setHasJwt(!!getAccessToken())
  }, [path])

  useEffect(() => {
    if (!isUserAuthMode()) return
    if (getAccessToken()) return
    const next = encodeURIComponent(path || '/daily')
    router.replace(`/login?next=${next}`)
  }, [path, router])

  useEffect(() => {
    if (!isUserAuthMode()) {
      setAuthProfile(null)
      setAuthProfileLoading(false)
      return
    }
    if (!getAccessToken()) {
      if (hasClientApiToken()) {
        setAuthProfile(null)
        setAuthProfileLoading(false)
      }
      return
    }
    let cancelled = false
    ;(async () => {
      setAuthProfileLoading(true)
      try {
        const m = await api.get<{ user: AuthUser }>('/api/v1/auth/me')
        if (!cancelled) setAuthProfile(m.user)
      } catch {
        if (!cancelled) setAuthProfile(null)
      } finally {
        if (!cancelled) setAuthProfileLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path, hasJwt])

  useEffect(() => {
    if (!isUserAuthMode() || !authProfile || userIsPro(authProfile)) return
    if (path !== '/daily' && path !== '/picks-history') router.replace('/daily')
  }, [path, authProfile, router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (isUserAuthMode() && getAccessToken() && authProfileLoading) {
          return
        }
        const st = await api.get<StatusResponse>('/api/v1/status')
        if (cancelled) return
        setStatus(st)
        const freeJwt =
          isUserAuthMode() && getAccessToken() && authProfile && !userIsPro(authProfile)
        if (freeJwt) {
          setStrategy(null)
          return
        }
        if (st.auth_required === true && !hasClientApiToken() && !isUserAuthMode()) {
          setStrategy(null)
          return
        }
        if (isUserAuthMode() && authProfile && !userIsPro(authProfile)) {
          setStrategy(null)
          return
        }
        const d = await api.get<{ strategy: Strategy }>('/api/v1/dashboard/strategy')
        if (!cancelled) setStrategy(d.strategy ?? null)
      } catch {
        if (!cancelled) setStrategy(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path, authProfile, authProfileLoading])

  async function killSwitch() {
    if (!confirm('Stop all bot trading immediately?')) return
    setStopping(true)
    try {
      await api.put('/api/v1/strategy', { ...strategy, bot_enabled: false })
      setStrategy(s => (s ? { ...s, bot_enabled: false } : s))
    } finally {
      setStopping(false)
    }
  }

  function logout() {
    setAccessToken(null)
    router.replace('/login')
  }

  const isLive = strategy && !strategy.paper_mode && strategy.bot_enabled

  const adminClient = isUserAuthMode() && hasClientApiToken() && !getAccessToken()
  const freeAccount =
    isUserAuthMode() && !!getAccessToken() && authProfile !== null && !userIsPro(authProfile)

  if (isUserAuthMode() && getAccessToken() && authProfileLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (freeAccount && !adminClient) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(14, 19, 24, 0.92)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <BrandLogo href="/" size="sm" />
          <nav style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
            <Link
              href="/daily"
              style={{ color: path === '/daily' ? 'var(--accent)' : 'var(--text2)', textDecoration: 'none', fontWeight: path === '/daily' ? 700 : 400 }}
            >
              Today&apos;s pick
            </Link>
            <Link
              href="/picks-history"
              style={{
                color: path === '/picks-history' ? 'var(--accent)' : 'var(--text2)',
                textDecoration: 'none',
                fontWeight: path === '/picks-history' ? 700 : 400,
              }}
            >
              Performance
            </Link>
            <Link href="/pricing" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              Upgrade to Pro
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              Sign out
            </button>
          </nav>
        </header>
        <main style={{ flex: 1, padding: '28px 24px', maxWidth: 720, margin: '0 auto', width: '100%' }}>{children}</main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 244,
          background: 'linear-gradient(180deg, #0c1016 0%, var(--bg2) 100%)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
        }}
      >
        <div style={{ padding: '22px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <BrandLogo href="/daily" size="md" showTagline />
        </div>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span className={`dot ${status?.kalshi_configured ? 'dot-green pulse' : 'dot-red'}`} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: status?.kalshi_configured ? 'var(--accent)' : 'var(--red)' }}>
                {status?.kalshi_configured ? 'Connected' : 'Disconnected'}
              </div>
              {status?.balance_dollars && (
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>${status.balance_dollars} balance</div>
              )}
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '14px 12px', overflowY: 'auto' }}>
          <Link
            href="/daily"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              borderRadius: 8,
              marginBottom: 4,
              color: path === '/daily' ? '#fff' : 'var(--text2)',
              background: path === '/daily' ? 'rgba(0,229,160,0.08)' : 'transparent',
              border: path === '/daily' ? '1px solid rgba(0,229,160,0.22)' : '1px solid transparent',
              fontSize: 13,
              fontWeight: path === '/daily' ? 700 : 500,
              textDecoration: 'none',
            }}
          >
            <IconNav>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3v18M8 7h8M8 17h8" strokeLinecap="round" />
              </svg>
            </IconNav>
            Daily pick
          </Link>
          <Link
            href="/picks-history"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              borderRadius: 8,
              marginBottom: 12,
              color: path === '/picks-history' ? '#fff' : 'var(--text2)',
              background: path === '/picks-history' ? 'rgba(0,229,160,0.08)' : 'transparent',
              border: path === '/picks-history' ? '1px solid rgba(0,229,160,0.22)' : '1px solid transparent',
              fontSize: 13,
              fontWeight: path === '/picks-history' ? 700 : 500,
              textDecoration: 'none',
            }}
          >
            <IconNav>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6h16v12H4V6z" strokeLinejoin="round" />
                <path d="M8 10h8M8 14h5" strokeLinecap="round" />
              </svg>
            </IconNav>
            Performance
          </Link>
          {NAV.map(item => {
            const active = path === item.href || path.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 14px',
                  borderRadius: 8,
                  marginBottom: 4,
                  color: active ? '#fff' : 'var(--text2)',
                  background: active ? 'rgba(0,229,160,0.06)' : 'transparent',
                  border: active ? '1px solid rgba(0,229,160,0.18)' : '1px solid transparent',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  textDecoration: 'none',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <span style={{ color: active ? 'var(--accent)' : 'var(--text3)' }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 8 }}>
            {strategy ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`dot ${strategy.bot_enabled ? (strategy.paper_mode ? 'dot-amber' : 'dot-red') : 'dot-dim'}`} />
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {!strategy.bot_enabled ? 'Bot off' : strategy.paper_mode ? 'Paper mode' : 'LIVE trading'}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Loading...</div>
            )}
          </div>
          {strategy?.bot_enabled && (
            <button className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={killSwitch} disabled={stopping}>
              {stopping ? 'Stopping...' : '⬛ Stop Bot'}
            </button>
          )}
        </div>
      </aside>

      <div style={{ marginLeft: 244, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {isLive && (
          <div className="live-bar">
            <span className="dot dot-red pulse" />
            Live trading active — real money on the line
          </div>
        )}
        {isUserAuthMode() && !hasJwt && !hasClientApiToken() && (
          <div
            style={{
              background: 'var(--amber-bg)',
              borderBottom: '1px solid rgba(245,166,35,0.35)',
              padding: '8px 32px',
              fontSize: 11,
              color: 'var(--amber)',
              lineHeight: 1.4,
            }}
          >
            Multi-user mode:{' '}
            <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 700 }}>
              Sign in
            </Link>{' '}
            or{' '}
            <Link href="/register" style={{ color: 'var(--accent)' }}>
              create an account
            </Link>{' '}
            — or set <code style={{ fontSize: 10 }}>NEXT_PUBLIC_API_TOKEN</code> for a shared admin token.
          </div>
        )}
        {status?.auth_required === true && !hasClientApiToken() && !isUserAuthMode() && (
          <div
            style={{
              background: 'var(--amber-bg)',
              borderBottom: '1px solid rgba(245,166,35,0.35)',
              padding: '8px 32px',
              fontSize: 11,
              color: 'var(--amber)',
              lineHeight: 1.4,
            }}
          >
            Backend expects an API token — add <code style={{ fontSize: 10 }}>NEXT_PUBLIC_API_TOKEN</code> to{' '}
            <code style={{ fontSize: 10 }}>.env.local</code> (same value as server <code style={{ fontSize: 10 }}>KALSHIBOT_API_TOKEN</code>), then restart
            Next.js. Skip this if you clear the server token for local dev.
          </div>
        )}
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1200, width: '100%' }}>{children}</main>
      </div>
    </div>
  )
}
