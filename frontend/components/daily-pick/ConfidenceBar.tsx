'use client';

import { cn } from '@/lib/utils';

interface ConfidenceBarProps {
  value: number;
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceBar({ value, showLabel = true, className }: ConfidenceBarProps) {
  const getGradient = () => {
    if (value >= 70) return 'from-primary via-success to-success';
    if (value >= 50) return 'from-warning/80 via-warning to-primary';
    return 'from-destructive via-destructive to-warning';
  };

  const getTextColor = () => {
    if (value >= 70) return 'text-success';
    if (value >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getGlowColor = () => {
    if (value >= 70) return 'shadow-success/20';
    if (value >= 50) return 'shadow-warning/20';
    return 'shadow-destructive/20';
  };

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Confidence Level
          </span>
          <div className="flex items-baseline gap-1">
            <span className={cn('font-mono text-lg font-medium', getTextColor())}>{value}</span>
            <span className="font-mono text-xs text-muted-foreground">/100</span>
          </div>
        </div>
      )}
      
      <div className="relative">
        {/* Track */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
          {/* Progress */}
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r transition-all duration-1000 ease-out shadow-lg',
              getGradient(),
              getGlowColor()
            )}
            style={{ width: `${value}%` }}
          />
        </div>
        
        {/* Tick marks */}
        <div className="absolute top-4 left-0 right-0 flex justify-between px-1">
          {[0, 25, 50, 75, 100].map((tick) => (
            <div key={tick} className="flex flex-col items-center">
              <div className={cn(
                'h-1 w-px',
                tick <= value ? 'bg-muted-foreground/30' : 'bg-muted/30'
              )} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
