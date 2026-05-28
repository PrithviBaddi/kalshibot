import { MarketsClient } from './MarketsClient';

export const metadata = {
  title: 'Markets — KalshiBot',
  description: 'Browse Kalshi markets and run on-demand AI analysis.',
};

export default function MarketsPage() {
  return <MarketsClient />;
}
