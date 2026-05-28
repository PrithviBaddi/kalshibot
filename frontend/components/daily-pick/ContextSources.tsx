'use client';

import { cn } from '@/lib/utils';

interface ContextSourcesProps {
  sources: string[];
  className?: string;
}

function sourceLabel(source: string): string {
  const s = String(source || '').trim();
  const map: Record<string, string> = {
    claude_used_web_search: 'Web Research',
    claude_used_kalshi_market: 'Live Market Data',
    claude_used_kalshi_price_history: 'Price History',
    claude_used_get_economic_data: 'Macro Data',
  };
  return map[s] || s.replace(/_/g, ' ');
}

export function ContextSources({ sources, className }: ContextSourcesProps) {
  const labels = sources.map(sourceLabel);
  return (
    <div className={cn('', className)}>
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Data Sources
      </p>
      <div className="flex flex-wrap gap-2">
        {labels.map((source, index) => (
          <span
            key={`${source}-${index}`}
            className="group inline-flex items-center gap-2 rounded-full border border-border/50 bg-secondary/50 px-4 py-2 transition-all duration-300 hover:border-primary/30 hover:bg-secondary"
          >
            <span className="flex h-1.5 w-1.5 items-center justify-center">
              <span 
                className="h-1.5 w-1.5 rounded-full bg-primary/50 group-hover:bg-primary transition-colors"
                style={{ animationDelay: `${index * 0.1}s` }}
              />
            </span>
            <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              {source}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
