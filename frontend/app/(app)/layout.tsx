'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, StatusResponse, Strategy, getAccessToken, hasClientApiToken, isUserAuthMode } from '@/lib/api'

const NAV = [
  { href: '/dashboard', label: 'Dashboard',  icon: '◈' },
  { href: '/scanner',   label: 'Scanner',    icon: '⊹' },
  { href: '/markets',   label: 'Markets',    icon: '≋' },
  { href: '/rules',     label: 'Rules',      icon: '◎' },
  { href: '/orders/paper', label: 'Paper & P&L', icon: '↗' },
  { href: '/activity',  label: 'Activity',   icon: '≡' },
  { href: '/strategy',  label: 'Settings',   icon: '⚙' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [stopping, setStopping] = useState(false)
  const [hasJwt, setHasJwt] = useState(false)

  useEffect(() => {
    setHasJwt(!!getAccessToken())
  }, [path])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const st = await api.get<StatusResponse>('/api/v1/status')
        if (cancelled) return
        setStatus(st)
        if (st.auth_required === true && !hasClientApiToken()) {
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
  }, [])

  async function killSwitch() {
    if (!confirm('Stop all bot trading immediately?')) return
    setStopping(true)
    try {
      await api.put('/api/v1/strategy', { ...strategy, bot_enabled: false })
      setStrategy(s => s ? { ...s, bot_enabled: false } : s)
    } finally { setStopping(false) }
  }

  const isLive = strategy && !strategy.paper_mode && strategy.bot_enabled

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
            Kalshi<span style={{ color: 'var(--accent)' }}>Bot</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Trading Assistant
          </div>
        </div>

        {/* Status pill */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', padding: '8px 12px', borderRadius: 6 }}>
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

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV.map(item => {
            const active = path === item.href || path.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 6,
                marginBottom: 2,
                color: active ? '#fff' : 'var(--text2)',
                background: active ? 'var(--bg3)' : 'transparent',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 14, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Bot mode indicator + kill switch */}
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
            <button className="btn btn-danger btn-sm" style={{ width: '100%', justifyContent: 'center' }}
              onClick={killSwitch} disabled={stopping}>
              {stopping ? 'Stopping...' : '⬛ Stop Bot'}
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column' }}>
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
            Multi-user mode: <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 700 }}>Sign in</Link>
            {' '}or <Link href="/register" style={{ color: 'var(--accent)' }}>create an account</Link>
            {' '}— or set <code style={{ fontSize: 10 }}>NEXT_PUBLIC_API_TOKEN</code> for a shared admin token.
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
            <code style={{ fontSize: 10 }}>.env.local</code> (same value as server{' '}
            <code style={{ fontSize: 10 }}>KALSHIBOT_API_TOKEN</code>), then restart Next.js. Skip this if you clear the server token for local dev.
          </div>
        )}
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1200, width: '100%' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
