'use client';

import { cn } from '@/lib/utils';
import type { RecommendationType } from '@/lib/types';

interface StatusPillProps {
  type: RecommendationType | 'correct' | 'incorrect' | 'pending';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatusPill({ type, size = 'md', className }: StatusPillProps) {
  const sizeStyles = {
    sm: 'px-2.5 py-1 text-[10px]',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-4 py-2 text-sm',
  };

  const typeStyles = {
    BUY_YES: 'bg-success/10 text-success border-success/20',
    BUY_NO: 'bg-destructive/10 text-destructive border-destructive/20',
    PASS: 'bg-muted/50 text-muted-foreground border-border/50',
    NO_SIGNAL: 'bg-muted/50 text-muted-foreground border-border/50',
    correct: 'bg-success/10 text-success border-success/20',
    incorrect: 'bg-destructive/10 text-destructive border-destructive/20',
    pending: 'bg-muted/50 text-muted-foreground border-border/50',
  };

  const labels = {
    BUY_YES: 'Buy Yes',
    BUY_NO: 'Buy No',
    PASS: 'Pass',
    NO_SIGNAL: 'No Signal',
    correct: 'Correct',
    incorrect: 'Incorrect',
    pending: 'Pending',
  };

  return (
    <span 
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-mono uppercase tracking-wider transition-colors',
        sizeStyles[size],
        typeStyles[type],
        className
      )}
    >
      {labels[type]}
    </span>
  );
}
