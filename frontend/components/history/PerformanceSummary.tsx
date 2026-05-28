'use client';

import { StatCard } from '@/components/shared/StatCard';
import type { PerformanceStats } from '@/lib/types';

interface PerformanceSummaryProps {
  stats: PerformanceStats;
}

export function PerformanceSummary({ stats }: PerformanceSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total Picks"
        value={stats.totalPicks}
        subtext="All time recommendations"
      />
      <StatCard
        label="Resolved"
        value={stats.resolvedPicks}
        subtext="Markets with outcomes"
      />
      <StatCard
        label="Accuracy"
        value={stats.accuracy === null ? '—' : `${stats.accuracy}%`}
        subtext={`Based on ${stats.resolvedPicks} resolved directional predictions`}
        trend="up"
      />
      <StatCard
        label="Win Streak"
        value={`+${stats.currentStreak}`}
        subtext="Correct in a row"
        trend="up"
      />
    </div>
  );
}
