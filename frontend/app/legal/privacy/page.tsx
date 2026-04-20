import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '48px 24px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>← Home</Link>
        <Link href="/dashboard" style={{ color: 'var(--text3)' }}>App</Link>
      </div>
      <h1 style={{ fontSize: 26, marginTop: 16, marginBottom: 12 }}>Privacy</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
        This application may store account identifiers, trading preferences, activity logs, and <strong>encrypted</strong> Kalshi API credentials on infrastructure you or your operator controls.
      </p>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
        Depending on configuration, subprocessors may include: <strong>Kalshi</strong> (exchange API), <strong>Stripe</strong> (payments), <strong>Anthropic</strong> (optional AI analysis), <strong>NewsAPI</strong> or similar (optional headlines), and <strong>email providers</strong> (e.g. Resend) for transactional messages. Only send data you are allowed to share under your agreements and laws.
      </p>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
        Retention and deletion policies are set by whoever operates the deployment; document them for your users.
      </p>
      <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 24 }}>
        Replace this page with a jurisdiction-appropriate privacy policy before collecting data from the general public.
      </p>
    </div>
  )
}
