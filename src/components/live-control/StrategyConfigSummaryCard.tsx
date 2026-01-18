// src/components/live-control/StrategyConfigSummaryCard.tsx
"use client";

import { useEffect, useState } from "react";

type StrategySettings = {
  mode: "paper" | "live";
  preset: "coreplus315";
  symbols: string[];
  sessions: { asia: boolean; london: boolean; ny: boolean };

  // core settings (v1)
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

        const res = await fetchJSON<StrategyGetResponse>(
          "/api/trading-state/strategy-settings"
        );
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

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Active Strategy Config</div>
          <p className="aura-muted aura-text-xs aura-mt-10">
            Read-only. Edit these on the Strategy page.
          </p>
        </div>

        {loading ? (
          <div className="aura-muted aura-text-xs">Loading…</div>
        ) : cfg ? (
          <div className="aura-muted aura-text-xs">
            ${cfg.riskUsd} • RR {cfg.rr} • Max stop {cfg.maxStopTicks} •{" "}
            {String(cfg.entryType)}
          </div>
        ) : (
          <div className="aura-muted aura-text-xs" />
        )}
      </div>

      {err ? (
        <div className="aura-mt-12 aura-error-block">
          <div className="aura-text-xs">Error</div>
          <div className="aura-text-xs">{err}</div>
        </div>
      ) : null}

      {cfg ? (
        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Mode</span>
            <span className="aura-muted">{cfg.mode}</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Preset</span>
            <span className="aura-muted">{cfg.preset}</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Symbols</span>
            <span className="aura-muted">{cfg.symbols?.join(", ") || "—"}</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Sessions</span>
            <span className="aura-muted">
              {cfg.sessions?.ny ? "NY" : ""}
              {cfg.sessions?.london ? (cfg.sessions?.ny ? ", London" : "London") : ""}
              {cfg.sessions?.asia
                ? cfg.sessions?.ny || cfg.sessions?.london
                  ? ", Asia"
                  : "Asia"
                : ""}
              {!cfg.sessions?.ny && !cfg.sessions?.london && !cfg.sessions?.asia
                ? "—"
                : ""}
            </span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Risk / trade</span>
            <span className="aura-muted">${cfg.riskUsd}</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>RR</span>
            <span className="aura-muted">{cfg.rr}</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Max stop (ticks)</span>
            <span className="aura-muted">{cfg.maxStopTicks}</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Entry type</span>
            <span className="aura-muted">{String(cfg.entryType)}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
