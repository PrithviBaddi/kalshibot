'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api, formatApiError } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    try {
      await api.post('/api/v1/auth/forgot-password', { email })
      setMsg('If an account exists, check your email for a reset link. (With no email provider configured, check server logs for the link in development.)')
    } catch (err: unknown) {
      setMsg(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card fade-in" style={{ maxWidth: 400 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Forgot password</h1>
        <form onSubmit={submit}>
          <label style={{ fontSize: 11, color: 'var(--text3)' }}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', marginBottom: 16 }} />
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        {msg && <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{msg}</p>}
        <p style={{ marginTop: 16, fontSize: 12 }}>
          <Link href="/login">← Sign in</Link>
        </p>
      </div>
    </div>
  )
}
