'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { fetchMarketsBrowse, type MarketRow } from '@/lib/api';

export function MarketsClient() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user?.is_pro) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const rows = await fetchMarketsBrowse(50);
        if (active) setMarkets(rows);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load markets.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen pt-32 text-center font-mono text-muted-foreground">Loading...</div>
    );
  }

  if (!user?.is_pro) {
    return (
      <div className="min-h-screen pt-32 px-6 max-w-lg mx-auto text-center">
        <h1 className="editorial-heading text-3xl mb-4">Pro markets browser</h1>
        <p className="text-muted-foreground mb-6 font-mono text-sm">
          Browse live Kalshi markets and jump into on-demand analysis with one click.
        </p>
        <Link href="/login" className="inline-block rounded-md bg-primary px-6 py-3 font-mono text-primary-foreground">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pt-28 pb-20">
      <div className="mx-auto max-w-5xl px-6">
        <header className="mb-10">
          <h1 className="editorial-heading text-4xl mb-2">Markets</h1>
          <p className="font-mono text-sm text-muted-foreground">Live Kalshi contracts — analyze any row instantly.</p>
        </header>

        {loading && <p className="font-mono text-sm text-muted-foreground">Loading markets...</p>}
        {error && <p className="font-mono text-sm text-destructive mb-4">{error}</p>}

        <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
          {markets.map((m) => (
            <div
              key={m.ticker}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 hover:bg-secondary/20 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-primary mb-1">{m.ticker}</p>
                <p className="text-sm text-foreground line-clamp-2">{m.title}</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-1">
                  {m.category} · mid {m.midProb}% · vol {m.volume.toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  router.push(`/analyze?ticker=${encodeURIComponent(m.ticker)}&auto=1`)
                }
                className="shrink-0 rounded-md border border-primary/50 px-4 py-2 font-mono text-xs text-primary hover:bg-primary/10 transition-colors"
              >
                Analyze this market
              </button>
            </div>
          ))}
          {!loading && markets.length === 0 && (
            <p className="px-5 py-8 font-mono text-sm text-muted-foreground text-center">No markets returned.</p>
          )}
        </div>
      </div>
    </div>
  );
}
