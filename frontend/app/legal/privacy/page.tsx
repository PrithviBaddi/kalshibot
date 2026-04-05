import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '48px 24px', maxWidth: 720, margin: '0 auto' }}>
      <Link href="/dashboard" style={{ fontSize: 12, color: 'var(--accent)' }}>← Back</Link>
      <h1 style={{ fontSize: 26, marginTop: 16, marginBottom: 12 }}>Privacy</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
        This application may store account data, trading preferences, and encrypted Kalshi API credentials on servers you control.
        Optional integrations (e.g. Claude, NewsAPI) may send market titles to third parties per your server configuration.
      </p>
      <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 24 }}>
        Replace this page with a jurisdiction-appropriate privacy policy before collecting data from the general public.
      </p>
    </div>
  )
}
