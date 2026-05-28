'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/shared/AuthProvider';
import {
  fetchBatchAccuracy,
  fetchBatchRuns,
  startBatchAnalyze,
  type BatchAccuracy,
  type BatchRun,
} from '@/lib/api';

const DEFAULT_CATEGORIES = ['Politics', 'Economics', 'Financials'];

function AccRow({ label, stats }: { label: string; stats: { total: number; actionable_resolved: number; accuracy_percent: number | null } }) {
  const acc = stats.accuracy_percent;
  return (
    <tr className="border-t border-border/40">
      <td className="px-4 py-2 font-mono text-sm">{label}</td>
      <td className="px-4 py-2 font-mono text-sm text-right">{stats.total}</td>
      <td className="px-4 py-2 font-mono text-sm text-right">{stats.actionable_resolved}</td>
      <td className="px-4 py-2 font-mono text-sm text-right">
        {acc === null || acc === undefined ? '—' : `${acc}%`}
      </td>
    </tr>
  );
}

export function AdminTestingClient() {
  const { user, loading: authLoading } = useAuth();
  const [runs, setRuns] = useState<BatchRun[]>([]);
  const [accuracy, setAccuracy] = useState<BatchAccuracy | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([fetchBatchRuns(), fetchBatchAccuracy()]);
    setRuns(r);
    setAccuracy(a);
  }, []);

  useEffect(() => {
    if (!user?.is_admin) return;
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load testing data.'));
  }, [user, load]);

  if (authLoading) {
    return <div className="min-h-screen pt-32 text-center font-mono text-muted-foreground">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen pt-32 px-6 text-center">
        <p className="mb-4 font-mono text-sm text-muted-foreground">Admin sign-in required.</p>
        <Link href="/login" className="rounded-md bg-primary px-6 py-3 font-mono text-primary-foreground">
          Sign In
        </Link>
      </div>
    );
  }

  if (!user.is_admin) {
    return (
      <div className="min-h-screen pt-32 px-6 text-center">
        <h1 className="editorial-heading text-2xl mb-2">Access denied</h1>
        <p className="font-mono text-sm text-muted-foreground">This page is for admin accounts only.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pt-28 pb-20">
      <div className="mx-auto max-w-5xl px-6">
        <header className="mb-8">
          <h1 className="editorial-heading text-4xl mb-2">Batch Testing</h1>
          <p className="font-mono text-sm text-muted-foreground">
            Internal calibration — runs async in the background on the server.
          </p>
        </header>

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            setMessage('');
            try {
              const runId = await startBatchAnalyze(DEFAULT_CATEGORIES, 30);
              setMessage(`Batch started: ${runId}`);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to start batch.');
            } finally {
              setBusy(false);
            }
          }}
          className="mb-8 rounded-md bg-primary px-6 py-3 font-mono text-sm text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Starting...' : 'Run Batch Analysis'}
        </button>

        {message && <p className="mb-4 font-mono text-sm text-success">{message}</p>}
        {error && <p className="mb-4 font-mono text-sm text-destructive">{error}</p>}

        <section className="mb-12">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">Past runs</h2>
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="font-mono text-[10px] uppercase text-muted-foreground">
                  <th className="text-left px-4 py-3">Run ID</th>
                  <th className="text-right px-4 py-3">Started</th>
                  <th className="text-right px-4 py-3">Picks</th>
                  <th className="text-right px-4 py-3">Resolved</th>
                  <th className="text-right px-4 py-3">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.run_id} className="border-t border-border/40">
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]">{r.run_id}</td>
                    <td className="px-4 py-2 font-mono text-xs text-right">
                      {new Date(r.timestamp * 1000).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-sm text-right">{r.total_picks}</td>
                    <td className="px-4 py-2 font-mono text-sm text-right">{r.resolved_count}</td>
                    <td className="px-4 py-2 font-mono text-sm text-right">
                      {r.accuracy_percent == null ? '—' : `${r.accuracy_percent}%`}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">
                      No batch runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {accuracy && (
          <section>
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
              Accuracy breakdown
            </h2>
            <div className="glass-card rounded-2xl overflow-hidden mb-6">
              <table className="w-full">
                <thead>
                  <tr className="font-mono text-[10px] uppercase text-muted-foreground">
                    <th className="text-left px-4 py-3">Segment</th>
                    <th className="text-right px-4 py-3">Total</th>
                    <th className="text-right px-4 py-3">Actionable resolved</th>
                    <th className="text-right px-4 py-3">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  <AccRow label="Overall" stats={accuracy.overall} />
                  {Object.entries(accuracy.by_category).map(([k, v]) => (
                    <AccRow key={`cat-${k}`} label={`Category: ${k}`} stats={v} />
                  ))}
                  {Object.entries(accuracy.by_recommended_action).map(([k, v]) => (
                    <AccRow key={`act-${k}`} label={k.replace('_', ' ')} stats={v} />
                  ))}
                  {Object.entries(accuracy.by_confidence_band).map(([k, v]) => (
                    <AccRow key={`conf-${k}`} label={`Confidence ${k}`} stats={v} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
