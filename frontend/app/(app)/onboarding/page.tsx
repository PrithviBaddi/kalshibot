'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api, formatApiError, isUserAuthMode } from '@/lib/api'

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [apiKeyId, setApiKeyId] = useState('')
  const [pem, setPem] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  if (!isUserAuthMode()) {
    return (
      <div className="fade-in">
        <p style={{ color: 'var(--text2)' }}>Onboarding is for multi-user mode. Set NEXT_PUBLIC_USER_AUTH=1.</p>
        <Link href="/dashboard">Dashboard</Link>
      </div>
    )
  }

  async function saveKeys() {
    setSaving(true)
    setMsg('')
    try {
      await api.put('/api/v1/auth/kalshi-credentials', {
        api_key_id: apiKeyId.trim(),
        private_key_pem: pem.trim(),
      })
      setStep(3)
    } catch (e: unknown) {
      setMsg(formatApiError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fade-in" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 26, marginBottom: 8 }}>Welcome to KalshiBot</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 28 }}>
        Connect your Kalshi Trade API keys so the app can load quotes, run paper trades, and evaluate rules on your behalf.
      </p>

      {step === 1 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>1 · What you need</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
            In Kalshi: <strong>Account → API Keys</strong>. Create a key and download or copy your <strong>RSA private key (PEM)</strong> and the <strong>API Key ID</strong> (UUID). Keys are encrypted on our server.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
            I have my keys →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>2 · Paste credentials</div>
          <label style={{ fontSize: 11, color: 'var(--text3)' }}>API Key ID</label>
          <input value={apiKeyId} onChange={(e) => setApiKeyId(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
          <label style={{ fontSize: 11, color: 'var(--text3)' }}>Private key (PEM)</label>
          <textarea value={pem} onChange={(e) => setPem(e.target.value)} rows={8} style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)' }} />
          {msg && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{msg}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-primary" disabled={saving || !apiKeyId.trim() || !pem.trim()} onClick={saveKeys}>
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>3 · You&apos;re set</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Keys saved. Open the dashboard — the sidebar should show <strong>Connected</strong> once the API responds.
          </p>
          <Link href="/dashboard" className="btn btn-primary" style={{ textDecoration: 'none', color: '#000' }}>
            Go to dashboard
          </Link>
          <p style={{ marginTop: 16, fontSize: 12 }}>
            <Link href="/strategy">Settings</Link> · <Link href="/pricing">Upgrade to Pro</Link>
          </p>
        </div>
      )}
    </div>
  )
}
