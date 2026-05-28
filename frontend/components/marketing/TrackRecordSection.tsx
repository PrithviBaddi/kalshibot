'use client';

import { useEffect, useState } from 'react';
import { fetchPerformanceStats } from '@/lib/api';
import type { PerformanceStats } from '@/lib/types';

export function TrackRecordSection() {
  const [stats, setStats] = useState<PerformanceStats>({
    totalPicks: 0,
    resolvedPicks: 0,
    accuracy: null,
    currentStreak: 0,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await fetchPerformanceStats();
        if (active) setStats(s);
      } catch {
        // keep fallback values
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="relative py-24 lg:py-28">
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="glass-card rounded-2xl p-8 lg:p-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-px w-8 bg-success/50" />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-success">Track Record</span>
          </div>
          <div className="grid gap-6 sm:grid-cols-3 mb-6">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Accuracy</p>
              <p className="font-mono text-3xl text-foreground mt-2">
                {stats.accuracy === null ? '—' : `${stats.accuracy}%`}
              </p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Directional Picks</p>
              <p className="font-mono text-3xl text-foreground mt-2">{stats.totalPicks}</p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Resolved Sample</p>
              <p className="font-mono text-3xl text-foreground mt-2">{stats.resolvedPicks}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Track record updated daily as markets resolve.
          </p>
        </div>
      </div>
    </section>
  );
}
