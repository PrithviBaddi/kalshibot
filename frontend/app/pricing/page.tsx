'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, formatApiError, getAccessToken, isUserAuthMode } from '@/lib/api'

export default function PricingPage() {
  const router = useRouter()
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function goCheckout() {
    if (!isUserAuthMode()) {
      setMsg('Multi-user billing is not enabled (set NEXT_PUBLIC_USER_AUTH=1 and backend KALSHIBOT_USER_AUTH=1).')
      return
    }
    if (!getAccessToken()) {
      router.push('/login?next=/pricing')
      return
    }
    setLoading(true)
    setMsg('')
    try {
      const r = await api.post<{ url: string }>('/api/v1/billing/checkout-session', {})
      if (r.url) window.location.href = r.url
    } catch (e: unknown) {
      setMsg(formatApiError(e))
    } finally {
      setLoading(false)
    }
  }

  async function goPortal() {
    if (!getAccessToken()) {
      router.push('/login?next=/pricing')
      return
    }
    setLoading(true)
    setMsg('')
    try {
      const r = await api.post<{ url: string }>('/api/v1/billing/portal-session', {})
      if (r.url) window.location.href = r.url
    } catch (e: unknown) {
      setMsg(formatApiError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 28px', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#fff' }}>
          Kalshi<span style={{ color: 'var(--accent)' }}>Bot</span>
        </Link>
        <Link href="/login" style={{ fontSize: 13 }}>
          Sign in
        </Link>
      </header>
      <div style={{ flex: 1, padding: '48px 24px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Pricing</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 32 }}>
          Free includes one shared <strong>daily pick</strong> (research snippet for everyone that day). Pro unlocks the full app: paper trading, Kalshi connection, scanner, rules, and automation. Set <code style={{ fontSize: 11 }}>STRIPE_PRICE_ID</code> on the server.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>Free</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>$0</div>
            <ul style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, paddingLeft: 18, marginBottom: 16 }}>
              <li>Today&apos;s shared daily pick (sign in)</li>
              <li>No dashboard, paper, or Kalshi in the app</li>
              <li>Not financial advice — markets can go to zero</li>
            </ul>
            <Link href="/register" className="btn btn-ghost" style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }}>
              Start free
            </Link>
          </div>
          <div className="card" style={{ borderColor: 'rgba(0,229,160,0.35)' }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>Pro</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Stripe</div>
            <ul style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, paddingLeft: 18, marginBottom: 16 }}>
              <li>Full dashboard, scanner, rules, paper &amp; live trading</li>
              <li>Connect your Kalshi account (encrypted)</li>
              <li>Claude + news on demand analyses; higher automation limits</li>
              <li>Manage billing in Stripe portal</li>
            </ul>
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={loading} onClick={goCheckout}>
              {loading ? '…' : 'Subscribe with Stripe'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 8 }} disabled={loading} onClick={goPortal}>
              Manage subscription
            </button>
          </div>
        </div>
        {msg && (
          <p style={{ marginTop: 20, fontSize: 12, color: 'var(--red)', lineHeight: 1.45 }}>{msg}</p>
        )}
        <p style={{ marginTop: 32, fontSize: 12, color: 'var(--text3)' }}>
          <Link href="/">← Home</Link>
        </p>
      </div>
    </div>
  )
}
