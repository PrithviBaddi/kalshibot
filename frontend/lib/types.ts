export type RecommendationType = 'BUY_YES' | 'BUY_NO' | 'PASS';

export interface DailyPick {
  id: string;
  date: string;
  question: string;
  ticker: string;
  category: string;
  kalshiProb: number;
  modelProb: number;
  recommendation: RecommendationType;
  confidence: number;
  reasoning: string;
  edge: number;
  source: string;
  sourcesUsed: string[];
  updatedAt: string;
}

export interface HistoryRow {
  id: string;
  date: string;
  question: string;
  ticker: string;
  recommendation: RecommendationType;
  resolved: boolean;
  correct: boolean | null;
  kalshiProb: number;
  modelProb: number;
  edge: number;
}

export interface PricingPlan {
  name: string;
  price: string;
  priceNote?: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

export interface Feature {
  icon: string;
  title: string;
  description: string;
  stat: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface PerformanceStats {
  totalPicks: number;
  resolvedPicks: number;
  accuracy: number;
  currentStreak: number;
}
