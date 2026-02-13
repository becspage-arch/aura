"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type StrategySettings = {
  mode: "paper" | "live" | string;
  preset: string | null;

  symbols: string[] | null;
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
    const trimmed = text ? text.replace(/\s+/g, " ").slice(0, 140) : "";
    throw new Error(`${res.status} ${res.statusText}${trimmed ? ` - ${trimmed}` : ""}`);
  }

  return (await res.json()) as T;
}

function sessionList(s: StrategySettings["sessions"] | null | undefined) {
  if (!s) return [];
  return [s.asia ? "Asia" : null, s.london ? "London" : null, s.ny ? "NY" : null].filter(Boolean) as string[];
}

export function StrategyConfigSummaryCard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<StrategySettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetchJSON<StrategyGetResponse>("/api/trading-state/strategy-settings");
        if (cancelled) return;

        setCfg(res.strategySettings);
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

  const symbols = useMemo(() => cfg?.symbols?.filter(Boolean) ?? [], [cfg]);
  const sessions = useMemo(() => sessionList(cfg?.sessions), [cfg]);

  const preset = cfg?.preset ?? "â€”";
  const mode = cfg?.mode ?? "â€”";

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Active Strategy</div>
          <p className="aura-muted aura-text-xs aura-mt-10">
            This is a read-only snapshot of your current settings.
          </p>
        </div>

        <Link href="/app/strategy-setup" className="aura-btn aura-btn-subtle">
          Edit Strategy â†’
        </Link>
      </div>

      {err ? (
        <div className="aura-mt-12 aura-error-block">
          <div className="aura-text-xs">Error</div>
          <div className="aura-text-xs">{err}</div>
        </div>
      ) : null}

      <div className="aura-mt-12">
        <div className="aura-muted aura-text-xs">
          {loading ? "Loadingâ€¦" : `${preset} â€¢ ${String(mode).toUpperCase()}`}
        </div>

        <div className="aura-mt-12 aura-grid-4">
          <div className="aura-card-muted">
            <div className="aura-stat-label">Risk</div>
            <div className="aura-mini-value">{loading || !cfg ? "â€”" : `$${cfg.riskUsd}`}</div>
            <div className="aura-stat-sub">Max risk per trade</div>
          </div>

          <div className="aura-card-muted">
            <div className="aura-stat-label">RR</div>
            <div className="aura-mini-value">{loading || !cfg ? "â€”" : `${cfg.rr}R`}</div>
            <div className="aura-stat-sub">Reward to risk</div>
          </div>

          <div className="aura-card-muted">
            <div className="aura-stat-label">Max Stop</div>
            <div className="aura-mini-value">{loading || !cfg ? "â€”" : `${cfg.maxStopTicks}t`}</div>
            <div className="aura-stat-sub">Ticks</div>
          </div>

          <div className="aura-card-muted">
            <div className="aura-stat-label">Sessions</div>
            <div className="aura-mini-value">{loading ? "â€”" : sessions.length ? sessions.join(", ") : "â€”"}</div>
            <div className="aura-stat-sub">When Aura can trade</div>
          </div>
        </div>

        <div className="aura-mt-12 aura-muted aura-text-xs">
          Symbols: {loading ? "â€¦" : symbols.length ? symbols.join(", ") : "â€”"} â€¢ Entry:{" "}
          {loading ? "â€¦" : cfg ? String(cfg.entryType) : "â€”"}
        </div>
      </div>
    </section>
  );
}

