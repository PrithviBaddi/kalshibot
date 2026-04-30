'use client';

import { cn } from '@/lib/utils';
import { useState } from 'react';

interface HistoryFiltersProps {
  onDateRangeChange?: (value: string) => void;
  onTypeChange?: (value: string) => void;
  onResolvedChange?: (value: string) => void;
}

const dateRanges = [
  { value: 'all', label: 'All Time' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

const types = [
  { value: 'all', label: 'All' },
  { value: 'BUY_YES', label: 'Buy Yes' },
  { value: 'BUY_NO', label: 'Buy No' },
  { value: 'PASS', label: 'Pass' },
];

const statuses = [
  { value: 'all', label: 'All' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'pending', label: 'Pending' },
];

export function HistoryFilters({
  onDateRangeChange,
  onTypeChange,
  onResolvedChange,
}: HistoryFiltersProps) {
  const [dateRange, setDateRange] = useState('all');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');

  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
      <div className="flex flex-wrap items-center gap-4">
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Period
          </span>
          <div className="flex rounded-lg border border-border/50 bg-card p-1">
            {dateRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => {
                  setDateRange(range.value);
                  onDateRangeChange?.(range.value);
                }}
                className={cn(
                  'px-3 py-1.5 font-mono text-xs rounded-md transition-all duration-200',
                  dateRange === range.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Type
          </span>
          <div className="flex rounded-lg border border-border/50 bg-card p-1">
            {types.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setType(t.value);
                  onTypeChange?.(t.value);
                }}
                className={cn(
                  'px-3 py-1.5 font-mono text-xs rounded-md transition-all duration-200',
                  type === t.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Status
          </span>
          <div className="flex rounded-lg border border-border/50 bg-card p-1">
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setStatus(s.value);
                  onResolvedChange?.(s.value);
                }}
                className={cn(
                  'px-3 py-1.5 font-mono text-xs rounded-md transition-all duration-200',
                  status === s.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Export */}
      <button className="group flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 bg-card font-mono text-xs text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export CSV
      </button>
    </div>
  );
}
