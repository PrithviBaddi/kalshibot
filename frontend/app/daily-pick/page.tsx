import { DailyPickClient } from './DailyPickClient';

export const metadata = {
  title: 'Daily Pick — KalshiBot',
  description: 'Today\'s high-conviction prediction market pick with AI-powered analysis.',
};

export default function DailyPickPage() {
  return <DailyPickClient />;
}
