// src/components/strategy/StrategyStatusCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type StrategySettings = {
  mode: "paper" | "live";
  preset: "coreplus315";
  symbols: string[];
  sessions: { asia: boolean; london: boolean; ny: boolean };
  riskUsd: number;
  rr: number;
  maxStopTicks: number;
  entryType: "market" | "limit" | string;
};

type StrategyGetResponse = {
  ok: true;
  strategySettings: StrategySettings;
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  return (await res.json()) as T;
}

export function StrategyStatusCard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState<StrategySettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetchJSON<StrategyGetResponse>(
          "/api/trading-state/strategy-settings"
        );
        if (cancelled) return;

        setCurrent(res.strategySettings);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const sessionLabel = useMemo(() => {
    if (!current) return "—";
    const s: string[] = [];
    if (current.sessions?.asia) s.push("Asia");
    if (current.sessions?.london) s.push("London");
    if (current.sessions?.ny) s.push("NY");
    return s.length ? s.join(", ") : "None";
  }, [current]);

  const symbolsLabel = useMemo(() => {
    if (!current) return "—";
    return Array.isArray(current.symbols) && current.symbols.length
      ? current.symbols.join(", ")
      : "—";
  }, [current]);

  const modeLabel = useMemo(() => {
    if (!current) return "—";
    return current.mode === "live" ? "Live" : "Paper";
  }, [current]);

  const riskLabel = useMemo(() => {
    if (!current) return "—";
    return `$${current.riskUsd} • RR ${current.rr} • Max ${current.maxStopTicks}`;
  }, [current]);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div className="aura-card-title">Strategy Status</div>
        <div className="aura-muted aura-text-xs">Overview</div>
      </div>

      {err ? (
        <div className="aura-mt-12 aura-error-block">
          <div className="aura-text-xs">Error</div>
          <div className="aura-text-xs">{err}</div>
        </div>
      ) : null}

      <div
        className="aura-mt-12 aura-health-strip"
        aria-label="Strategy status overview"
      >
        <div className="aura-health-pill">
          <span className="aura-health-key">Mode</span>
          <span className="aura-health-val">{loading ? "Loading…" : modeLabel}</span>
        </div>

        <div className="aura-health-pill">
          <span className="aura-health-key">Strategy</span>
          <span className="aura-health-val">
            {loading ? "Loading…" : current?.preset === "coreplus315" ? "315 CorePlus" : "—"}
          </span>
        </div>

        <div className="aura-health-pill">
          <span className="aura-health-key">Symbol(s)</span>
          <span className="aura-health-val">{loading ? "Loading…" : symbolsLabel}</span>
        </div>

        <div className="aura-health-pill">
          <span className="aura-health-key">Sessions</span>
          <span className="aura-health-val">{loading ? "Loading…" : sessionLabel}</span>
        </div>

        <div className="aura-health-pill">
          <span className="aura-health-key">Risk</span>
          <span className="aura-health-val">{loading ? "Loading…" : riskLabel}</span>
        </div>

        <div className="aura-health-pill">
          <span className="aura-health-key">State</span>
          <span className="aura-health-val">Locked</span>
        </div>
      </div>

      <p className="aura-muted aura-text-xs aura-mt-10">
        This summary reflects the current configuration Aura would run with.
      </p>
    </section>
  );
}
