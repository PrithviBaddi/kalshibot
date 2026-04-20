'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, AuthTokenResponse, formatApiError, isUserAuthMode, setAccessToken, userIsPro } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await api.post<AuthTokenResponse>('/api/v1/auth/register', { email, password })
      setAccessToken(r.access_token)
      if (!isUserAuthMode()) router.push('/dashboard')
      else if (userIsPro(r.user)) router.push('/dashboard')
      else router.push('/daily')
      router.refresh()
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div className="card fade-in" style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Create account</h1>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 24 }}>
          Password must be at least 8 characters. Free accounts get the daily pick; Pro unlocks the full app and Kalshi.
        </p>
        <form onSubmit={submit}>
          {error && (
            <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 8, padding: 12, marginBottom: 16, color: 'var(--red)', fontSize: 12 }}>
              {error}
            </div>
          )}
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" style={{ width: '100%', marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" style={{ width: '100%', marginBottom: 20 }} />
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text2)' }}>
          Already have an account? <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
          {' · '}
          <Link href="/legal/privacy" style={{ color: 'var(--text3)' }}>Privacy</Link>
        </p>
      </div>
    </div>
  )
}
