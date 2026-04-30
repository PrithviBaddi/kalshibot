import type { DailyPick, HistoryRow, PricingPlan, Feature, FAQ, PerformanceStats } from './types';

export const dailyPick: DailyPick = {
  id: 'pick-001',
  date: '2024-01-15',
  question: 'Will Bitcoin exceed $50,000 by end of January 2024?',
  ticker: 'BTC-50K-JAN24',
  category: 'Crypto',
  kalshiProb: 42,
  modelProb: 67,
  recommendation: 'BUY_YES',
  confidence: 72,
  reasoning: 'Our model identifies a significant probability gap based on recent ETF approval momentum, institutional inflows, and technical breakout patterns. Historical data suggests the market is underpricing this outcome.',
  edge: 25,
  source: 'Claude 3.5',
  sourcesUsed: ['Web Search', 'Market Data', 'Price History', 'Macro Analysis'],
  updatedAt: '12 min ago',
};

export const historyData: HistoryRow[] = [
  {
    id: 'h-001',
    date: '2024-01-14',
    question: 'Will the Fed cut rates in Q1 2024?',
    ticker: 'FED-CUT-Q1',
    recommendation: 'BUY_NO',
    resolved: true,
    correct: true,
    kalshiProb: 65,
    modelProb: 38,
    edge: 27,
  },
  {
    id: 'h-002',
    date: '2024-01-13',
    question: 'Will Tesla stock close above $250 this week?',
    ticker: 'TSLA-250-W2',
    recommendation: 'BUY_YES',
    resolved: true,
    correct: true,
    kalshiProb: 35,
    modelProb: 58,
    edge: 23,
  },
  {
    id: 'h-003',
    date: '2024-01-12',
    question: 'Will inflation YoY drop below 3% in January report?',
    ticker: 'CPI-3PCT-JAN',
    recommendation: 'PASS',
    resolved: true,
    correct: null,
    kalshiProb: 48,
    modelProb: 52,
    edge: 4,
  },
  {
    id: 'h-004',
    date: '2024-01-11',
    question: 'Will Apple announce a new product category in Q1?',
    ticker: 'AAPL-NEW-Q1',
    recommendation: 'BUY_NO',
    resolved: true,
    correct: false,
    kalshiProb: 25,
    modelProb: 12,
    edge: 13,
  },
  {
    id: 'h-005',
    date: '2024-01-10',
    question: 'Will ETH reach $3,000 before BTC halving?',
    ticker: 'ETH-3K-HALV',
    recommendation: 'BUY_YES',
    resolved: false,
    correct: null,
    kalshiProb: 40,
    modelProb: 62,
    edge: 22,
  },
  {
    id: 'h-006',
    date: '2024-01-09',
    question: 'Will unemployment stay below 4% in December report?',
    ticker: 'UNEMP-4PCT-DEC',
    recommendation: 'BUY_YES',
    resolved: true,
    correct: true,
    kalshiProb: 55,
    modelProb: 78,
    edge: 23,
  },
  {
    id: 'h-007',
    date: '2024-01-08',
    question: 'Will S&P 500 close at new all-time high this week?',
    ticker: 'SPX-ATH-W2',
    recommendation: 'BUY_YES',
    resolved: true,
    correct: true,
    kalshiProb: 48,
    modelProb: 71,
    edge: 23,
  },
  {
    id: 'h-008',
    date: '2024-01-07',
    question: 'Will oil prices exceed $80/barrel by end of week?',
    ticker: 'OIL-80-W2',
    recommendation: 'BUY_NO',
    resolved: true,
    correct: true,
    kalshiProb: 58,
    modelProb: 35,
    edge: 23,
  },
];

export const performanceStats: PerformanceStats = {
  totalPicks: 156,
  resolvedPicks: 142,
  accuracy: 68.3,
  currentStreak: 5,
};

export const pricingPlans: PricingPlan[] = [
  {
    name: 'Free',
    price: '$0',
    priceNote: 'forever',
    features: [
      '1 daily pick preview',
      'Basic probability estimates',
      'Limited history (7 days)',
      'Community access',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$49',
    priceNote: '/month',
    features: [
      'Unlimited AI analyses',
      'Full daily pick details',
      'Complete history access',
      'Advanced reasoning insights',
      'Real-time alerts',
      'Priority support',
      'API access',
    ],
    cta: 'Start Pro Trial',
    highlighted: true,
  },
];

export const features: Feature[] = [
  {
    icon: 'search',
    title: 'Agentic Research',
    description: 'AI performs live web research and market data retrieval before generating probability estimates.',
    stat: '5 tool calls max',
  },
  {
    icon: 'target',
    title: 'Daily Pick Engine',
    description: 'One high-conviction pick every day with clear probability gap and actionable recommendation.',
    stat: 'Updated daily',
  },
  {
    icon: 'chart',
    title: 'Performance Tracking',
    description: 'Historical recommendations with transparent resolved outcome tracking and accuracy metrics.',
    stat: 'Transparent outcomes',
  },
];

export const faqs: FAQ[] = [
  {
    question: 'How does KalshiBot generate predictions?',
    answer: 'KalshiBot uses advanced AI agents that perform real-time web research, analyze market data, and compare against Kalshi\'s current prices to identify probability gaps and generate recommendations.',
  },
  {
    question: 'What markets does KalshiBot cover?',
    answer: 'We cover all major Kalshi markets including economics (Fed rates, inflation), politics, crypto, stocks, and current events. Our AI analyzes markets where it can find meaningful edge.',
  },
  {
    question: 'How accurate are the predictions?',
    answer: 'Our historical accuracy rate is tracked transparently on the Performance page. We focus on high-conviction picks where our model identifies significant probability gaps, typically achieving 65-70% accuracy on resolved predictions.',
  },
  {
    question: 'Can I cancel my Pro subscription anytime?',
    answer: 'Yes, you can cancel your Pro subscription at any time. You\'ll continue to have access until the end of your billing period with no additional charges.',
  },
  {
    question: 'Is this financial advice?',
    answer: 'No. KalshiBot provides AI-generated analysis for informational purposes only. All predictions are probabilistic estimates and should not be considered financial advice. Always do your own research.',
  },
  {
    question: 'How often is the daily pick updated?',
    answer: 'The daily pick is refreshed every morning at 9 AM ET. The AI analyzes overnight developments and current market conditions to generate fresh recommendations.',
  },
];

export const testimonials = [
  { name: 'Alex K.', role: 'Trader', quote: 'Finally, an edge in prediction markets.' },
  { name: 'Sarah M.', role: 'Analyst', quote: 'The AI research is surprisingly thorough.' },
  { name: 'Mike R.', role: 'Investor', quote: 'Transparent tracking builds trust.' },
];

export const socialProofLogos = [
  'TechCrunch',
  'Bloomberg',
  'Forbes',
  'The Information',
  'Axios',
];
