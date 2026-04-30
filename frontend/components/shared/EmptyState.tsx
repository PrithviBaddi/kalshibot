'use client';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-card/30 px-8 py-20 text-center',
        className
      )}
    >
      {/* Icon */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-border/50 bg-card">
          <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
      </div>
      
      <h3 className="editorial-heading text-xl text-foreground mb-2">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">{description}</p>
      
      {action && (
        <button 
          onClick={action.onClick} 
          className="mt-8 rounded-lg bg-primary px-6 py-3 font-mono text-sm text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
