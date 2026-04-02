"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../components/api";
import { JsonPanel } from "../components/JsonPanel";

type Strategy = {
  bot_enabled: boolean;
  paper_mode: boolean;
  max_position_cents: number;
  daily_loss_limit_cents: number;
  min_volume: number;
  max_spread: number;
  notes: string;
  blocked_keywords: string[];
};

export default function HomePage() {
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [rules, setRules] = useState<any>(null);
  const [runs, setRuns] = useState<any>(null);
  const [orders, setOrders] = useState<any>(null);
  const [jobs, setJobs] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [edit, setEdit] = useState({
    bot_enabled: true,
    paper_mode: true,
    max_position_cents: 5000,
    daily_loss_limit_cents: 1000,
    min_volume: 0,
    max_spread: 0.2,
    notes: "starter-dashboard",
    blocked_keywords: "",
  });

  const blockedKeywordsArray = useMemo(
    () =>
      edit.blocked_keywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [edit.blocked_keywords],
  );

  async function refreshAll() {
    setError(null);
    setBusy(true);
    try {
      const s = await apiGet<{ strategy: Strategy }>("/api/v1/dashboard/strategy");
      setStrategy(s.strategy);
      setEdit((prev) => ({
        ...prev,
        bot_enabled: s.strategy.bot_enabled,
        paper_mode: s.strategy.paper_mode,
        max_position_cents: s.strategy.max_position_cents,
        daily_loss_limit_cents: s.strategy.daily_loss_limit_cents,
        min_volume: s.strategy.min_volume,
        max_spread: s.strategy.max_spread,
        notes: s.strategy.notes,
        blocked_keywords: (s.strategy.blocked_keywords ?? []).join(","),
      }));

      setRules(await apiGet("/api/v1/dashboard/rules"));
      setRuns(await apiGet("/api/v1/dashboard/rule-runs?limit=20"));
      setOrders(await apiGet("/api/v1/dashboard/paper-orders?limit=20"));
      setJobs(await apiGet("/api/v1/dashboard/jobs"));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveStrategy() {
    setError(null);
    setBusy(true);
    try {
      await apiPost(
        "/api/v1/strategy",
        {
          bot_enabled: edit.bot_enabled,
          paper_mode: edit.paper_mode,
          max_position_cents: edit.max_position_cents,
          daily_loss_limit_cents: edit.daily_loss_limit_cents,
          min_volume: edit.min_volume,
          max_spread: edit.max_spread,
          notes: edit.notes,
          blocked_keywords: blockedKeywordsArray,
        },
        "PUT",
      );
      await refreshAll();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runAllEnabledOnce() {
    setError(null);
    setBusy(true);
    try {
      await apiPost("/api/v1/jobs/run-all-enabled-once", {});
      await refreshAll();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
        KalshiBot Dashboard (Starter)
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Backend API base: <code>{process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000"}</code>
      </div>

      <div className="nav">
        <button className="btn btnSecondary" onClick={refreshAll} disabled={busy}>
          Refresh
        </button>
        <button className="btn" onClick={saveStrategy} disabled={busy}>
          Save Strategy
        </button>
        <button className="btn btnSecondary" onClick={runAllEnabledOnce} disabled={busy}>
          Run All Enabled Rules Once (paper)
        </button>
      </div>

      {error ? (
        <div className="card" style={{ borderColor: "#7f1d1d", background: "#1f1113", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Error</div>
          <pre>{error}</pre>
        </div>
      ) : null}

      <div className="row">
        <div className="card" style={{ flex: "1 1 520px" }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Strategy (edit)</div>

          <div className="row">
            <div style={{ flex: "1 1 160px" }}>
              <label>bot_enabled</label>
              <select
                value={edit.bot_enabled ? "true" : "false"}
                onChange={(e) => setEdit((p) => ({ ...p, bot_enabled: e.target.value === "true" }))}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label>paper_mode</label>
              <select
                value={edit.paper_mode ? "true" : "false"}
                onChange={(e) => setEdit((p) => ({ ...p, paper_mode: e.target.value === "true" }))}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ flex: "1 1 240px" }}>
              <label>max_position_cents</label>
              <input
                type="number"
                value={edit.max_position_cents}
                onChange={(e) => setEdit((p) => ({ ...p, max_position_cents: Number(e.target.value) }))}
              />
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <label>daily_loss_limit_cents</label>
              <input
                type="number"
                value={edit.daily_loss_limit_cents}
                onChange={(e) => setEdit((p) => ({ ...p, daily_loss_limit_cents: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ flex: "1 1 240px" }}>
              <label>min_volume</label>
              <input
                type="number"
                value={edit.min_volume}
                onChange={(e) => setEdit((p) => ({ ...p, min_volume: Number(e.target.value) }))}
              />
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <label>max_spread (0..1)</label>
              <input
                type="number"
                step="0.01"
                value={edit.max_spread}
                onChange={(e) => setEdit((p) => ({ ...p, max_spread: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>notes</label>
            <input
              value={edit.notes}
              onChange={(e) => setEdit((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <label>blocked_keywords (comma-separated)</label>
            <input
              value={edit.blocked_keywords}
              onChange={(e) => setEdit((p) => ({ ...p, blocked_keywords: e.target.value }))}
            />
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Current strategy (read-only snapshot) is shown on the right.
          </div>
        </div>

        <div style={{ flex: "1 1 520px" }}>
          <JsonPanel title="Strategy (current)" data={strategy} />
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="row">
        <JsonPanel title="Jobs" data={jobs} />
        <JsonPanel title="Rules" data={rules} />
      </div>

      <div style={{ height: 12 }} />

      <div className="row">
        <JsonPanel title="Rule runs (latest 20)" data={runs} />
        <JsonPanel title="Paper orders (latest 20)" data={orders} />
      </div>
    </main>
  );
}

