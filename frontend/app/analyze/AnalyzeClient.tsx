'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DailyPickCard } from '@/components/daily-pick/DailyPickCard';
import { useAuth } from '@/components/shared/AuthProvider';
import { runOnDemandAnalysis } from '@/lib/api';
import type { DailyPick } from '@/lib/types';
import { cn } from '@/lib/utils';

const LOADING_PHASES = [
  { untilMs: 5000, label: 'Researching market...' },
  { untilMs: 15000, label: 'Analyzing web sources...' },
  { untilMs: Infinity, label: 'Generating probability estimate...' },
];

function loadingLabel(elapsedMs: number): string {
  for (const p of LOADING_PHASES) {
    if (elapsedMs < p.untilMs) return p.label;
  }
  return LOADING_PHASES[LOADING_PHASES.length - 1].label;
}

export function AnalyzeClient() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState('');
  const [active, setActive] = useState<DailyPick | null>(null);
  const [history, setHistory] = useState<DailyPick[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const autoRan = useRef(false);

  const canAnalyze = Boolean(user?.is_pro);

  const runAnalysis = useCallback(
    async (rawTicker: string) => {
      const ticker = rawTicker.trim();
      if (!ticker) return;
      setError('');
      setBusy(true);
      setElapsed(0);
      const started = Date.now();
      const timer = window.setInterval(() => setElapsed(Date.now() - started), 250);
      try {
        const pick = await runOnDemandAnalysis(ticker);
        setActive(pick);
        setHistory((prev) => [pick, ...prev.filter((p) => p.ticker !== pick.ticker)].slice(0, 5));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Analysis failed.');
      } finally {
        window.clearInterval(timer);
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    const t = searchParams.get('ticker');
    const auto = searchParams.get('auto');
    if (t && auto === '1' && canAnalyze && !authLoading && !autoRan.current) {
      autoRan.current = true;
      setInput(t);
      void runAnalysis(t);
      router.replace('/analyze', { scroll: false });
    }
  }, [searchParams, canAnalyze, authLoading, runAnalysis, router]);

  const statusText = useMemo(() => loadingLabel(elapsed), [elapsed]);

  if (authLoading) {
    return (
      <div className="min-h-screen pt-32 px-6 text-center font-mono text-muted-foreground">
        Loading account...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-32 px-6 max-w-lg mx-auto text-center">
        <h1 className="editorial-heading text-3xl mb-4">Sign in to analyze markets</h1>
        <p className="text-muted-foreground mb-6 font-mono text-sm">
          On-demand analysis is available on Pro and during your free trial.
        </p>
        <Link href="/login" className="inline-block rounded-md bg-primary px-6 py-3 font-mono text-primary-foreground">
          Sign In
        </Link>
      </div>
    );
  }

  if (!canAnalyze) {
    return (
      <div className="min-h-screen pt-32 px-6 max-w-lg mx-auto text-center">
        <h1 className="editorial-heading text-3xl mb-4">Pro feature</h1>
        <p className="text-muted-foreground mb-6 font-mono text-sm">
          Upgrade to Pro for up to 20 on-demand analyses per day with the full agentic pipeline.
        </p>
        <Link href="/daily-pick" className="inline-block rounded-md border border-border px-6 py-3 font-mono text-sm">
          View Daily Pick
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pt-28 pb-20">
      <div className="mx-auto max-w-4xl px-6">
        <header className="mb-10 text-center">
          <h1 className="editorial-heading text-4xl text-foreground mb-3">Analyze a Market</h1>
          <p className="font-mono text-sm text-muted-foreground">
            Full Claude agentic pipeline — 20 analyses per UTC day on Pro.
          </p>
        </header>

        <form
          className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-3 mb-8"
          onSubmit={(e) => {
            e.preventDefault();
            void runAnalysis(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter a Kalshi ticker or paste a market URL..."
            className="flex-1 rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm outline-none focus:border-primary"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className={cn(
              'rounded-lg bg-primary px-6 py-3 font-mono text-sm text-primary-foreground transition-opacity',
              (busy || !input.trim()) && 'opacity-50 cursor-not-allowed',
            )}
          >
            Analyze
          </button>
        </form>

        {busy && (
          <div className="mb-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
            <p className="font-mono text-sm text-primary animate-pulse">{statusText}</p>
          </div>
        )}

        {error && (
          <p className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-sm text-destructive">
            {error}
          </p>
        )}

        {history.length > 0 && (
          <div className="mb-10">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Session history
            </h2>
            <div className="flex flex-wrap gap-2">
              {history.map((h) => (
                <button
                  key={h.ticker}
                  type="button"
                  onClick={() => setActive(h)}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs hover:border-primary hover:text-primary transition-colors"
                >
                  {h.ticker}
                </button>
              ))}
            </div>
          </div>
        )}

        {active && !busy && <DailyPickCard pick={active} />}
      </div>
    </div>
  );
}
