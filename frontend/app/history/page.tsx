import { HistoryClient } from './HistoryClient';

export const metadata = {
  title: 'Performance History — KalshiBot',
  description: 'Track our AI prediction performance with transparent historical results.',
};

export default function HistoryPage() {
  return <HistoryClient />;
}
