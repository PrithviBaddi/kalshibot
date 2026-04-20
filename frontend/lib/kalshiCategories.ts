/** Kalshi API `category` values for /series — daily pick rotates Politics, Economics, Financials. */
export const KALSHI_SCAN_CATEGORIES = [
  'Politics',
  'Economics',
  'Financials',
  'Climate',
  'Tech',
  'Science',
  'Culture',
] as const

export type KalshiScanCategory = (typeof KALSHI_SCAN_CATEGORIES)[number]
