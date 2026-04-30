'use client';

import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function StatCard({ label, value, subtext, trend, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'group relative glass-card rounded-xl p-6 transition-all duration-500 hover:border-primary/30',
        className
      )}
    >
      {/* Accent line */}
      <div className={cn(
        'absolute top-0 left-6 right-6 h-px transition-all duration-500',
        trend === 'up' && 'bg-gradient-to-r from-transparent via-success/50 to-transparent group-hover:via-success',
        trend === 'down' && 'bg-gradient-to-r from-transparent via-destructive/50 to-transparent group-hover:via-destructive',
        (!trend || trend === 'neutral') && 'bg-gradient-to-r from-transparent via-border to-transparent group-hover:via-primary/50'
      )} />
      
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        {label}
      </p>
      
      <p
        className={cn(
          'font-mono text-4xl lg:text-5xl font-light tracking-tight transition-colors',
          trend === 'up' && 'text-success',
          trend === 'down' && 'text-destructive',
          (!trend || trend === 'neutral') && 'text-foreground'
        )}
      >
        {value}
      </p>
      
      {subtext && (
        <p className="mt-3 text-xs text-muted-foreground">
          {subtext}
        </p>
      )}
      
      {/* Corner accent */}
      <div className={cn(
        'absolute bottom-4 right-4 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500',
        trend === 'up' && 'bg-success/10',
        trend === 'down' && 'bg-destructive/10',
        (!trend || trend === 'neutral') && 'bg-primary/10'
      )} />
    </div>
  );
}
