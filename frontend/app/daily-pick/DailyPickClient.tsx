'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DailyPickCard } from '@/components/daily-pick/DailyPickCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { DailyPickSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchTodayPick } from '@/lib/api';
import type { DailyPick } from '@/lib/types';

export function DailyPickClient() {
  const [pick, setPick] = useState<DailyPick | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const p = await fetchTodayPick();
        if (active) setPick(p);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load daily pick.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative min-h-screen pt-28 pb-20">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-success/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mb-12">
          <Link
            href="/"
            className="group inline-flex items-center gap-3 mb-8 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
            </svg>
            Back to home
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="h-px w-8 bg-primary/50" />
                <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">Intelligence Report</span>
              </div>
              <h1 className="editorial-heading text-4xl lg:text-5xl text-foreground">Daily Pick</h1>
              <p className="mt-3 text-muted-foreground max-w-md">
                One high-conviction recommendation, updated every morning at 9 AM ET
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-full border border-border/50 bg-card px-5 py-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-mono text-sm text-muted-foreground">Live from backend</span>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <DailyPickSkeleton />
        ) : error ? (
          <EmptyState title="Could not load daily pick" description={error} action={{ label: 'Retry', onClick: () => location.reload() }} />
        ) : pick ? (
          <DailyPickCard pick={pick} />
        ) : (
          <EmptyState
            title="No daily pick available"
            description="No pick has been generated yet, or this session does not have access."
          />
        )}
      </div>
    </div>
  );
}

