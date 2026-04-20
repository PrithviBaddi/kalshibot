import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'KalshiBot — Trade prediction markets with clarity',
  description:
    'Professional Kalshi assistant: paper trading, scanner, rules, and AI-backed daily picks. Built for serious traders.',
}

function IconRadar() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14" stroke="var(--accent)" strokeWidth="1.5" opacity="0.35" />
      <circle cx="16" cy="16" r="8" stroke="var(--accent)" strokeWidth="1.5" opacity="0.55" />
      <path d="M16 16 L22 10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2" fill="var(--accent)" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M16 4 L26 9 V16 C26 22 20 28 16 28 C12 28 6 22 6 16 V9 L16 4Z"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="rgba(0,229,160,0.08)"
      />
      <path d="M12 16 L15 19 L21 13" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconSpark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M16 4 L18 12 L26 14 L18 16 L16 24 L14 16 L6 14 L14 12 Z"
        fill="rgba(0,229,160,0.15)"
        stroke="var(--accent)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function MarketingHomePage() {
  return (
    <div className="marketing-root">
      <header className="marketing-header">
        <Link href="/" className="marketing-logo-link">
          <span className="marketing-logo-mark" aria-hidden />
          <span className="marketing-logo-text">
            Kalshi<span className="text-accent">Bot</span>
          </span>
        </Link>
        <nav className="marketing-nav">
          <Link href="/pricing">Pricing</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/login" className="marketing-nav-muted">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-primary marketing-cta-header">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="marketing-hero-glow" aria-hidden />
          <p className="marketing-eyebrow">Kalshi · institutional-grade workflow</p>
          <h1 className="marketing-title">See the edge in every prediction market.</h1>
          <p className="marketing-sub">
            KalshiBot connects to your account, runs paper trades and automation with guardrails, and surfaces ranked opportunities
            with optional AI analysis — so you ship a process, not a hunch.
          </p>
          <div className="marketing-hero-actions">
            <Link href="/register" className="btn btn-primary marketing-hero-cta">
              Start free
            </Link>
            <Link href="/pricing" className="btn btn-ghost marketing-hero-secondary">
              Compare plans
            </Link>
          </div>
        </section>

        <section className="marketing-section">
          <h2 className="marketing-section-title">Everything you need to trade with discipline</h2>
          <p className="marketing-section-lead">Three pillars — discovery, safety, depth — in one focused product.</p>
          <div className="marketing-features">
            <article className="marketing-feature-card">
              <div className="marketing-feature-icon">
                <IconRadar />
              </div>
              <h3>Scanner &amp; markets</h3>
              <p>Rank opportunities across series, filter noise, and drill into full market detail with analysis shortcuts.</p>
            </article>
            <article className="marketing-feature-card">
              <div className="marketing-feature-icon">
                <IconShield />
              </div>
              <h3>Paper &amp; risk limits</h3>
              <p>Simulate orders, scheduled rules, kill switches, and daily loss caps before touching live capital.</p>
            </article>
            <article className="marketing-feature-card">
              <div className="marketing-feature-icon">
                <IconSpark />
              </div>
              <h3>AI when it matters</h3>
              <p>Claude enrichment and a shared daily pick for Free users; higher limits and depth on Pro.</p>
            </article>
          </div>
        </section>

        <section className="marketing-section marketing-pricing-wrap">
          <h2 className="marketing-section-title">Simple pricing</h2>
          <p className="marketing-section-lead">Start free. Upgrade when you want the full trading surface.</p>
          <div className="marketing-pricing-grid">
            <div className="marketing-price-card">
              <div className="marketing-price-label">Free</div>
              <div className="marketing-price-amount">
                $0<span className="marketing-price-unit">/mo</span>
              </div>
              <ul className="marketing-price-list">
                <li>Shared daily pick &amp; calibration history</li>
                <li>Account, billing, and upgrade path</li>
                <li>No full dashboard or live Kalshi tools in-app</li>
              </ul>
              <Link href="/register" className="btn btn-ghost marketing-price-btn">
                Create account
              </Link>
            </div>
            <div className="marketing-price-card marketing-price-card-pro">
              <div className="marketing-price-label marketing-price-label-pro">Pro</div>
              <div className="marketing-price-amount">
                $49<span className="marketing-price-unit">/mo</span>
              </div>
              <p className="marketing-price-note">Billed via Stripe — cancel anytime.</p>
              <ul className="marketing-price-list">
                <li>Full dashboard, scanner, rules, paper &amp; live trading</li>
                <li>Encrypted Kalshi connection</li>
                <li>Claude + news on demand; higher automation limits</li>
              </ul>
              <Link href="/register" className="btn btn-primary marketing-price-btn">
                Get started
              </Link>
            </div>
          </div>
        </section>

        <section className="marketing-bottom-cta">
          <div>
            <h2 className="marketing-bottom-title">Ready to trade with a system?</h2>
            <p className="marketing-bottom-sub">Join in under a minute. No credit card for Free.</p>
          </div>
          <Link href="/register" className="btn btn-primary marketing-bottom-btn">
            Sign up free
          </Link>
        </section>
      </main>

      <footer className="marketing-footer">
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <span className="marketing-footer-disclaimer">Not financial advice. Markets can go to zero.</span>
      </footer>
    </div>
  )
}
