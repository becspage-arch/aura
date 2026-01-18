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
    throw new Error(
      `${res.status} ${res.statusText}${trimmed ? ` - ${trimmed}` : ""}`
    );
  }

  return (await res.json()) as T;
}

function sessionList(s: StrategySettings["sessions"] | null | undefined) {
  if (!s) return [];
  return [
    s.asia ? "Asia" : null,
    s.london ? "London" : null,
    s.ny ? "NY" : null,
  ].filter(Boolean) as string[];
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

  const symbols = useMemo(() => cfg?.symbols?.filter(Boolean) ?? [], [cfg]);
  const sessions = useMemo(() => sessionList(cfg?.sessions), [cfg]);

  const preset = cfg?.preset ?? "—";

  return (
    <Link href="/app/strategy" className="block">
      <section className="aura-card cursor-pointer">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Active Strategy</div>
            <p className="aura-muted aura-text-xs aura-mt-10">
              Snapshot only, locked to avoid accidental changes mid-session – click
              to edit in Strategy Settings →
            </p>
          </div>

          {!loading && cfg ? (
            <div className="aura-muted aura-text-xs">
              ${cfg.riskUsd} • RR {cfg.rr} • Max stop {cfg.maxStopTicks} •{" "}
              {String(cfg.entryType)}
            </div>
          ) : (
            <div className="aura-muted aura-text-xs">
              {loading ? "Loading…" : "—"}
            </div>
          )}
        </div>

        {err ? (
          <div className="aura-mt-12 aura-error-block">
            <div className="aura-text-xs">Error</div>
            <div className="aura-text-xs">{err}</div>
          </div>
        ) : null}

        {/* Strategy-style “health strip” snapshot (matches Strategy page) */}
        <div
          className="aura-mt-12 aura-health-strip"
          aria-label="Active strategy snapshot"
        >
          <div className="aura-health-pill">
            <span className="aura-health-key">Preset</span>
            <span className="aura-health-val">{loading ? "…" : preset}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Symbols</span>
            <span className="aura-health-val">
              {loading ? "…" : symbols.length ? symbols.join(", ") : "—"}
            </span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Sessions</span>
            <span className="aura-health-val">
              {loading ? "…" : sessions.length ? sessions.join(", ") : "—"}
            </span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Risk</span>
            <span className="aura-health-val">
              {loading || !cfg ? "…" : `$${cfg.riskUsd} • RR ${cfg.rr}`}
            </span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Entry</span>
            <span className="aura-health-val">
              {loading ? "…" : cfg ? String(cfg.entryType) : "—"}
            </span>
          </div>
        </div>
      </section>
    </Link>
  );
}
