'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PerformanceSummary } from '@/components/history/PerformanceSummary';
import { HistoryFilters } from '@/components/history/HistoryFilters';
import { PerformanceTable } from '@/components/history/PerformanceTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { CardSkeleton, TableRowSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchHistoryRows, fetchPerformanceStats } from '@/lib/api';
import type { HistoryRow, PerformanceStats } from '@/lib/types';

export function HistoryClient() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [stats, setStats] = useState<PerformanceStats>({
    totalPicks: 0,
    resolvedPicks: 0,
    accuracy: null,
    currentStreak: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [recType, setRecType] = useState('all');
  const [resolvedFilter, setResolvedFilter] = useState('all');
  const [showInconclusive, setShowInconclusive] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [h, s] = await Promise.all([fetchHistoryRows(), fetchPerformanceStats()]);
        if (!active) return;
        setRows(h);
        setStats(s);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load performance history.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    let out = [...rows];
    if (recType !== 'all') out = out.filter((r) => r.recommendation === recType);
    if (resolvedFilter === 'resolved') out = out.filter((r) => r.resolved);
    if (resolvedFilter === 'pending') out = out.filter((r) => !r.resolved);
    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      out = out.filter((r) => new Date(r.date) >= cutoff);
    }
    return out;
  }, [rows, dateRange, recType, resolvedFilter]);
  const isInconclusive = (row: HistoryRow) =>
    row.recommendation === 'PASS' || row.recommendation === 'NO_SIGNAL';
  const directionalRows = filtered.filter((r) => !isInconclusive(r));
  const inconclusiveRows = filtered.filter(isInconclusive);

  return (
    <div className="relative min-h-screen pt-28 pb-20">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-success/5 blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
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
                <div className="h-px w-8 bg-success/50" />
                <span className="font-mono text-xs uppercase tracking-[0.25em] text-success">Track Record</span>
              </div>
              <h1 className="editorial-heading text-4xl lg:text-5xl text-foreground">Performance History</h1>
              <p className="mt-3 text-muted-foreground max-w-lg">
                Full transparency on every prediction. See our complete historical record with outcomes.
              </p>
            </div>

            <Link
              href="/daily-pick"
              className="inline-flex items-center gap-3 rounded-lg bg-primary px-6 py-4 font-mono text-sm text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25"
            >
              View Today&apos;s Pick
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
            <div className="rounded-xl border border-border/50 bg-card">
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
            </div>
          </div>
        ) : error ? (
          <EmptyState title="Could not load performance history" description={error} action={{ label: 'Retry', onClick: () => location.reload() }} />
        ) : (
          <>
            <div className="mb-10">
              <PerformanceSummary stats={stats} />
            </div>

            <div className="mb-8">
              <HistoryFilters onDateRangeChange={setDateRange} onTypeChange={setRecType} onResolvedChange={setResolvedFilter} />
            </div>

            {directionalRows.length === 0 ? (
              <EmptyState title="No rows matched your filters" description="Try adjusting period, type, or status filters." />
            ) : (
              <PerformanceTable data={directionalRows} />
            )}
            {inconclusiveRows.length > 0 && (
              <div className="mt-6 glass-card rounded-2xl p-4">
                <button
                  type="button"
                  onClick={() => setShowInconclusive((v) => !v)}
                  className="w-full flex items-center justify-between gap-4 text-left"
                >
                  <div>
                    <h3 className="font-mono text-sm text-foreground uppercase tracking-[0.12em]">
                      Inconclusive — no strong signal
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PASS and NO_SIGNAL picks are tracked here and excluded from main accuracy display.
                    </p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {showInconclusive ? 'Hide' : 'Show'} ({inconclusiveRows.length})
                  </span>
                </button>
                {showInconclusive && (
                  <div className="mt-4">
                    <PerformanceTable data={inconclusiveRows} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

