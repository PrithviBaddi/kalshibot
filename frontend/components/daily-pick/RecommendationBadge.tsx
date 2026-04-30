'use client';

import { cn } from '@/lib/utils';
import type { RecommendationType } from '@/lib/types';

interface RecommendationBadgeProps {
  type: RecommendationType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function RecommendationBadge({ type, size = 'md', className }: RecommendationBadgeProps) {
  const sizeStyles = {
    sm: 'px-4 py-2 text-xs gap-2',
    md: 'px-6 py-3 text-sm gap-2',
    lg: 'px-8 py-4 text-base lg:text-lg gap-3',
  };

  const iconSize = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5 lg:w-6 lg:h-6',
  };

  const typeStyles = {
    BUY_YES: 'bg-success glow-success',
    BUY_NO: 'bg-destructive glow-destructive',
    PASS: 'bg-muted',
  };

  const textStyles = {
    BUY_YES: 'text-success-foreground',
    BUY_NO: 'text-destructive-foreground',
    PASS: 'text-muted-foreground',
  };

  const labels = {
    BUY_YES: 'BUY YES',
    BUY_NO: 'BUY NO',
    PASS: 'PASS',
  };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <span 
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-mono font-bold uppercase tracking-wider transition-transform hover:scale-105',
          sizeStyles[size],
          typeStyles[type],
          textStyles[type]
        )}
      >
        {type === 'BUY_YES' && (
          <svg className={iconSize[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        )}
        {type === 'BUY_NO' && (
          <svg className={iconSize[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        )}
        {type === 'PASS' && (
          <svg className={iconSize[size]} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        )}
        {labels[type]}
      </span>
    </div>
  );
}
