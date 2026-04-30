'use client';

import type { HistoryRow } from '@/lib/types';
import { StatusPill } from '@/components/shared/StatusPill';
import { cn } from '@/lib/utils';

interface PerformanceTableProps {
  data: HistoryRow[];
}

export function PerformanceTable({ data }: PerformanceTableProps) {
  const getResultIndicator = (row: HistoryRow) => {
    if (!row.resolved) {
      return (
        <div className="flex items-center justify-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted-foreground/50 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/50" />
          </span>
          <span className="font-mono text-xs text-muted-foreground">Pending</span>
        </div>
      );
    }
    if (row.correct) {
      return (
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/20">
            <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="font-mono text-xs text-success">Correct</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/20">
          <svg className="w-3.5 h-3.5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <span className="font-mono text-xs text-destructive">Incorrect</span>
      </div>
    );
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30">
              <th className="px-6 py-4 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Date
              </th>
              <th className="px-6 py-4 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Market
              </th>
              <th className="px-6 py-4 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Edge
              </th>
              <th className="px-6 py-4 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Action
              </th>
              <th className="px-6 py-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-border/20 transition-colors hover:bg-secondary/30',
                  index === data.length - 1 && 'border-b-0'
                )}
              >
                <td className="px-6 py-5">
                  <span className="font-mono text-sm text-muted-foreground">
                    {new Date(row.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col max-w-md">
                    <span className="text-sm text-foreground line-clamp-1">
                      {row.question}
                    </span>
                    <span className="mt-1 font-mono text-xs text-primary/70">
                      {row.ticker}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span
                    className={cn(
                      'font-mono text-lg font-medium',
                      row.edge >= 20 ? 'text-success' : row.edge >= 10 ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    +{row.edge}%
                  </span>
                </td>
                <td className="px-6 py-5">
                  <StatusPill type={row.recommendation} size="sm" />
                </td>
                <td className="px-6 py-5">
                  {getResultIndicator(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden divide-y divide-border/20">
        {data.map((row) => (
          <div key={row.id} className="p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground line-clamp-2 mb-2">
                  {row.question}
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-primary/70">{row.ticker}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(row.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusPill type={row.recommendation} size="sm" />
                <span
                  className={cn(
                    'font-mono text-sm font-medium',
                    row.edge >= 20 ? 'text-success' : row.edge >= 10 ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  +{row.edge}% edge
                </span>
              </div>
              {getResultIndicator(row)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
