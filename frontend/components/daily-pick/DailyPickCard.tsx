'use client';

import type { DailyPick } from '@/lib/types';
import { ProbabilityGauge } from './ProbabilityGauge';
import { ConfidenceBar } from './ConfidenceBar';
import { RecommendationBadge } from './RecommendationBadge';
import { ContextSources } from './ContextSources';
import { cn } from '@/lib/utils';

interface DailyPickCardProps {
  pick: DailyPick;
  className?: string;
}

export function DailyPickCard({ pick, className }: DailyPickCardProps) {
  const formattedDate = new Date(pick.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={cn('relative', className)}>
      {/* Main card */}
      <div className="glass-card rounded-3xl overflow-hidden glow-amber">
        {/* Header band */}
        <div className="relative border-b border-border/30 px-6 py-5 lg:px-10 lg:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Live indicator */}
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-success">Live</span>
              </div>
              <div className="h-4 w-px bg-border/50" />
              <span className="font-mono text-xs text-muted-foreground">{formattedDate}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-secondary px-3 py-1 font-mono text-xs text-secondary-foreground">
                {pick.category}
              </span>
              <span className="font-mono text-xs text-primary">{pick.ticker}</span>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="px-6 py-8 lg:px-10 lg:py-12">
          {/* Question */}
          <h2 className="editorial-heading text-2xl sm:text-3xl lg:text-4xl text-foreground text-center max-w-3xl mx-auto mb-12 leading-tight">
            {pick.question}
          </h2>

          {/* Probability comparison - the centerpiece */}
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16 mb-12">
            {/* Kalshi Gauge */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
              <ProbabilityGauge
                value={pick.kalshiProb}
                label="Kalshi Price"
                variant="neutral"
                size="lg"
              />
            </div>

            {/* Central recommendation */}
            <div className="flex flex-col items-center gap-4 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
              <RecommendationBadge type={pick.recommendation} size="lg" />
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl lg:text-3xl font-medium text-success">+{pick.edge}%</span>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">edge</span>
              </div>
            </div>

            {/* Model Gauge */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
              <ProbabilityGauge
                value={pick.modelProb}
                label="Our Model"
                variant="accent"
                size="lg"
              />
            </div>
          </div>

          {/* Confidence bar */}
          <div className="max-w-lg mx-auto mb-12 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
            <ConfidenceBar value={pick.confidence} />
          </div>

          {/* Reasoning section */}
          <div className="max-w-2xl mx-auto mb-10 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
            <div className="relative glass-card rounded-2xl p-6 lg:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border/50" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Analysis</span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border/50" />
              </div>
              <p className="text-muted-foreground leading-relaxed text-center">
                {pick.reasoning}
              </p>
            </div>
          </div>

          {/* Context sources */}
          <div className="max-w-2xl mx-auto text-center opacity-0 animate-fade-in-up" style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}>
            <ContextSources sources={pick.sourcesUsed} />
          </div>
        </div>

        {/* Footer - Meta info */}
        <div className="border-t border-border/30 px-6 py-4 lg:px-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-4">
              <span className="font-mono text-xs text-muted-foreground">
                Source: <span className="text-primary">{pick.source}</span>
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                Updated {pick.updatedAt}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Risk disclaimer - elegant placement */}
      <div className="mt-6 mx-auto max-w-2xl">
        <div className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 px-5 py-4">
          <svg className="w-4 h-4 text-warning mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="font-mono text-xs text-warning/80 leading-relaxed">
            This is not financial advice. AI predictions are probabilistic estimates based on available data. 
            Always conduct your own research and trade responsibly.
          </p>
        </div>
      </div>
    </div>
  );
}
