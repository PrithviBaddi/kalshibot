/**
 * Kalshi web app URLs do not use the raw contract ticker as the path
 * (e.g. /markets/KXFOO-BAR-BAZ 404s). Prefer the event page, then series.
 */

import type { Market } from './api'

export function kalshiPublicUrl(market: Pick<Market, 'ticker' | 'event_ticker' | 'series_ticker'>): {
  href: string
  kind: 'event' | 'series' | 'home'
} {
  const et = market.event_ticker?.trim()
  if (et) {
    return {
      href: `https://kalshi.com/events/${encodeURIComponent(et)}`,
      kind: 'event',
    }
  }
  const st = market.series_ticker?.trim()
  if (st) {
    return {
      href: `https://kalshi.com/markets/${encodeURIComponent(st.toLowerCase())}`,
      kind: 'series',
    }
  }
  return { href: 'https://kalshi.com/', kind: 'home' }
}
