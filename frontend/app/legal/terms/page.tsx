import Link from 'next/link'

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '48px 24px', maxWidth: 720, margin: '0 auto' }}>
      <Link href="/dashboard" style={{ fontSize: 12, color: 'var(--accent)' }}>← Back</Link>
      <h1 style={{ fontSize: 26, marginTop: 16, marginBottom: 12 }}>Terms of use</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
        KalshiBot is software that helps you interact with Kalshi prediction markets. By using this service you agree that:
      </p>
      <ul style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.7, paddingLeft: 20 }}>
        <li>You are responsible for your own trading decisions and API credentials.</li>
        <li>Paper trading and simulations are not guarantees of future results.</li>
        <li>You comply with Kalshi&apos;s terms and applicable laws in your jurisdiction.</li>
        <li>The authors provide the software as-is, without warranties of fitness for a particular purpose.</li>
      </ul>
      <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 24 }}>
        This is a template — replace with counsel-approved terms before a broad public launch.
      </p>
    </div>
  )
}
