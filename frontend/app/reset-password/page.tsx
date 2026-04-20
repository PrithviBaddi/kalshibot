'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, formatApiError } from '@/lib/api'

function ResetForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) {
      setMsg('Missing token. Open the link from your email.')
      return
    }
    setLoading(true)
    setMsg('')
    try {
      await api.post('/api/v1/auth/reset-password', { token, password })
      router.push('/login')
    } catch (err: unknown) {
      setMsg(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card fade-in" style={{ maxWidth: 400 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>New password</h1>
      <form onSubmit={submit}>
        {msg && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{msg}</p>}
        <label style={{ fontSize: 11, color: 'var(--text3)' }}>New password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={{ width: '100%', marginBottom: 16 }} />
        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 12 }}>
        <Link href="/login">Sign in</Link>
      </p>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Suspense fallback={<div style={{ color: 'var(--text2)' }}>Loading…</div>}>
        <ResetForm />
      </Suspense>
    </div>
  )
}
