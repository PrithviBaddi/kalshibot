'use client';

import { cn } from '@/lib/utils';

interface ProbabilityGaugeProps {
  value: number;
  label: string;
  variant?: 'neutral' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ProbabilityGauge({
  value,
  label,
  variant = 'neutral',
  size = 'md',
}: ProbabilityGaugeProps) {
  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  const sizeStyles = {
    sm: { container: 'h-20 w-20', value: 'text-xl', percent: 'text-[10px]', label: 'text-[10px]' },
    md: { container: 'h-28 w-28 lg:h-32 lg:w-32', value: 'text-2xl lg:text-3xl', percent: 'text-xs', label: 'text-[10px]' },
    lg: { container: 'h-36 w-36 lg:h-44 lg:w-44', value: 'text-3xl lg:text-4xl', percent: 'text-sm', label: 'text-xs' },
  };

  const ringColor = variant === 'accent' ? 'stroke-primary' : 'stroke-muted-foreground/50';
  const textColor = variant === 'accent' ? 'text-primary' : 'text-muted-foreground';
  const glowClass = variant === 'accent' ? 'drop-shadow-[0_0_12px_oklch(0.78_0.14_75_/_0.3)]' : '';

  return (
    <div className="flex flex-col items-center">
      <div className={cn('relative', sizeStyles[size].container)}>
        {/* Outer decorative ring */}
        <div className="absolute inset-0 rounded-full border border-border/20" />
        
        <svg className={cn('h-full w-full -rotate-90 transform', glowClass)} viewBox="0 0 100 100">
          {/* Background ring */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="5"
            className="stroke-muted/20"
          />
          {/* Progress ring */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            className={cn(ringColor, 'transition-all duration-1000 ease-out')}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
            }}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-mono font-medium', sizeStyles[size].value, textColor)}>
            {value}
          </span>
          <span className={cn('font-mono', sizeStyles[size].percent, variant === 'accent' ? 'text-primary/60' : 'text-muted-foreground/50')}>
            %
          </span>
        </div>
      </div>
      
      <span className={cn('mt-3 font-mono uppercase tracking-[0.15em]', sizeStyles[size].label, 'text-muted-foreground')}>
        {label}
      </span>
    </div>
  );
}
