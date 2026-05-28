'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchLatestPickFromHistory, fetchPerformanceStats } from '@/lib/api';
import type { DailyPick, PerformanceStats } from '@/lib/types';

export function Hero() {
  const [stats, setStats] = useState<PerformanceStats>({
    totalPicks: 0,
    resolvedPicks: 0,
    accuracy: null,
    currentStreak: 0,
  });
  const [preview, setPreview] = useState<DailyPick | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, p] = await Promise.all([
          fetchPerformanceStats(),
          fetchLatestPickFromHistory(),
        ]);
        if (!active) return;
        setStats(s);
        setPreview(p);
      } catch {
        // keep graceful fallback UI values
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const accuracyLabel = stats.accuracy === null ? '—' : `${stats.accuracy}%`;
  const updatedLabel = preview?.updatedAt ? preview.updatedAt : 'recently';

  return (
    <section className="relative min-h-screen overflow-hidden pt-20">
      {/* Dramatic ambient lighting */}
      <div className="pointer-events-none absolute inset-0">
        {/* Central amber glow */}
        <div className="absolute top-1/3 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[150px]" />
        {/* Secondary accent */}
        <div className="absolute bottom-0 right-0 h-[600px] w-[600px] rounded-full bg-accent/5 blur-[120px]" />
        {/* Grid overlay */}
        <div 
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(oklch(0.78 0.14 75 / 0.5) 1px, transparent 1px),
                              linear-gradient(90deg, oklch(0.78 0.14 75 / 0.5) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 pt-24 pb-32 lg:pt-32">
        {/* Editorial layout - asymmetric */}
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-start">
          
          {/* Left column - Main content */}
          <div className="lg:col-span-7 lg:pt-12">
            {/* Eyebrow */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
              <div className="inline-flex items-center gap-3 mb-8">
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
                <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                  Prediction Intelligence
                </span>
              </div>
            </div>
            
            {/* Main headline - Editorial serif */}
            <h1 className="opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
              <span className="editorial-heading block text-5xl sm:text-6xl lg:text-7xl xl:text-8xl text-foreground leading-[0.95]">
                Find alpha
              </span>
              <span className="editorial-heading block text-5xl sm:text-6xl lg:text-7xl xl:text-8xl leading-[0.95] mt-2">
                <span className="text-foreground">before the </span>
                <span className="relative inline-block">
                  <span className="relative z-10 text-primary">crowd.</span>
                  <span className="absolute bottom-2 left-0 right-0 h-3 bg-primary/20 -skew-x-6" />
                </span>
              </span>
            </h1>

            {/* Subheadline */}
            <p className="opacity-0 animate-fade-in-up mt-10 max-w-lg text-lg lg:text-xl text-muted-foreground leading-relaxed" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
              Institutional-grade AI that performs live research, analyzes market inefficiencies, 
              and surfaces high-conviction opportunities in prediction markets.
            </p>

            {/* CTA Group */}
            <div className="opacity-0 animate-fade-in-up mt-12 flex flex-col sm:flex-row items-start gap-4" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
              <Link
                href="/daily-pick"
                className="group relative overflow-hidden rounded-md bg-primary px-8 py-4 font-mono text-sm text-primary-foreground transition-all duration-500 hover:shadow-xl hover:shadow-primary/25"
              >
                <span className="relative z-10 flex items-center gap-3">
                  View Today&apos;s Pick
                  <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </Link>
              <Link
                href="/history"
                className="group flex items-center gap-3 px-6 py-4 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="h-px w-6 bg-border transition-all duration-300 group-hover:w-10 group-hover:bg-primary" />
                View Performance
              </Link>
            </div>

            {/* Social proof stats */}
            <div className="opacity-0 animate-fade-in-up mt-16 flex items-center gap-12" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}>
              <div>
                <div className="font-mono text-3xl lg:text-4xl text-foreground">{accuracyLabel}</div>
                <div className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">Accuracy</div>
              </div>
              <div className="h-12 w-px bg-border/50" />
              <div>
                <div className="font-mono text-3xl lg:text-4xl text-foreground">{stats.totalPicks}</div>
                <div className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">Picks Made</div>
              </div>
              <div className="h-12 w-px bg-border/50 hidden sm:block" />
              <div className="hidden sm:block">
                <div className="font-mono text-3xl lg:text-4xl text-success">{stats.currentStreak}</div>
                <div className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">Win Streak</div>
              </div>
            </div>
          </div>

          {/* Right column - Product Card */}
          <div className="lg:col-span-5 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}>
            <div className="relative">
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 h-32 w-32 rounded-full border border-primary/10" />
              <div className="absolute -bottom-8 -left-8 h-48 w-48 rounded-full border border-border/30" />
              
              {/* Main card */}
              <div className="relative glass-card rounded-2xl p-8 glow-amber">
                {/* Card header */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-2 w-2 items-center justify-center">
                      <span className="absolute h-2 w-2 animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative h-2 w-2 rounded-full bg-success" />
                    </div>
                    <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Live Pick</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">Updated {updatedLabel}</span>
                </div>

                {/* Question */}
                <p className="editorial-heading text-xl lg:text-2xl text-foreground mb-8">
                  {preview?.question || 'No recent pick available yet.'}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground mb-6">
                  Contract: {preview?.ticker || 'N/A'}
                </p>

                {/* Probability comparison */}
                <div className="grid grid-cols-3 gap-4 items-center mb-8">
                  {/* Kalshi */}
                  <div className="text-center">
                    <div className="relative mx-auto h-20 w-20 lg:h-24 lg:w-24">
                      <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6" className="stroke-muted/30" />
                        <circle
                          cx="50" cy="50" r="42" fill="none" strokeWidth="6" strokeLinecap="round"
                          className="stroke-muted-foreground/60 transition-all duration-1000"
                          style={{ strokeDasharray: 264, strokeDashoffset: 264 - ((preview?.kalshiProb || 0) / 100) * 264 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-mono text-xl lg:text-2xl font-medium text-muted-foreground">{preview?.kalshiProb ?? 0}</span>
                        <span className="font-mono text-[10px] text-muted-foreground/60">%</span>
                      </div>
                    </div>
                    <span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Kalshi</span>
                  </div>

                  {/* Recommendation badge */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-lg bg-success px-4 py-2 glow-success">
                      <span className="font-mono text-sm font-bold uppercase tracking-wider text-success-foreground">{preview?.recommendation?.replace('_', ' ') || 'PASS'}</span>
                    </div>
                    <span className="font-mono text-xs text-success">+{preview?.edge ?? 0}% edge</span>
                  </div>

                  {/* Our Model */}
                  <div className="text-center">
                    <div className="relative mx-auto h-20 w-20 lg:h-24 lg:w-24">
                      <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6" className="stroke-muted/30" />
                        <circle
                          cx="50" cy="50" r="42" fill="none" strokeWidth="6" strokeLinecap="round"
                          className="stroke-primary transition-all duration-1000"
                          style={{ strokeDasharray: 264, strokeDashoffset: 264 - ((preview?.modelProb || 0) / 100) * 264 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-mono text-xl lg:text-2xl font-medium text-primary">{preview?.modelProb ?? 0}</span>
                        <span className="font-mono text-[10px] text-primary/60">%</span>
                      </div>
                    </div>
                    <span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Our Model</span>
                  </div>
                </div>

                {/* Confidence bar */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-muted-foreground">Confidence</span>
                    <span className="font-mono text-xs font-medium text-success">{preview?.confidence ?? 0}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-primary via-success to-success transition-all duration-1000"
                      style={{ width: `${preview?.confidence ?? 0}%` }}
                    />
                  </div>
                </div>

                {/* Sources */}
                <div className="flex flex-wrap gap-2">
                  {(preview?.sourcesUsed || []).map((source) => (
                    <span key={source} className="rounded-full border border-border/50 bg-secondary/50 px-3 py-1 font-mono text-[10px] text-muted-foreground">
                      {source}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-0 animate-fade-in" style={{ animationDelay: '1s', animationFillMode: 'forwards' }}>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Scroll</span>
        <div className="h-12 w-px bg-gradient-to-b from-border to-transparent" />
      </div>
    </section>
  );
}
