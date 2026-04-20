'use client'

import Link from 'next/link'

type Props = {
  href?: string
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
}

export function BrandLogo({ href = '/', size = 'md', showTagline = false }: Props) {
  const scale = size === 'sm' ? 0.85 : size === 'lg' ? 1.15 : 1
  const titlePx = Math.round(20 * scale)
  const subPx = Math.round(9 * scale)
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        aria-hidden
        style={{
          width: Math.round(36 * scale),
          height: Math.round(36 * scale),
          borderRadius: 10,
          background: 'linear-gradient(145deg, rgba(0,229,160,0.18) 0%, var(--bg3) 55%, #0a0f14 100%)',
          border: '1px solid rgba(0,229,160,0.28)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 24px rgba(0,229,160,0.08)',
        }}
      >
        <svg width={Math.round(22 * scale)} height={Math.round(22 * scale)} viewBox="0 0 32 32" fill="none">
          <path
            d="M4 22h6l4-12 4 12h6"
            stroke="var(--accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 22V10" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" opacity={0.35} />
        </svg>
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: titlePx,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
          }}
        >
          Kalshi<span style={{ color: 'var(--accent)' }}>Bot</span>
        </div>
        {showTagline ? (
          <div
            style={{
              fontSize: subPx,
              color: 'var(--text3)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginTop: 2,
              fontWeight: 600,
            }}
          >
            Prediction intelligence
          </div>
        ) : null}
      </div>
    </div>
  )
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', display: 'inline-block' }}>
        {inner}
      </Link>
    )
  }
  return inner
}
