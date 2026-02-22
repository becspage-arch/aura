// src/app/app/strategy-setup/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import type { StrategyGetResponse, StrategyPostResponse, StrategySettings } from "./_lib/types";
import { fetchJSON } from "./_lib/api";

import { TradableSymbolsCard } from "./_components/TradableSymbolsCard";
import { TradingSessionsCard } from "./_components/TradingSessionsCard";
import { RiskConfigurationCard } from "./_components/RiskConfigurationCard";
import { PositionSizingCard } from "./_components/PositionSizingCard";
import { TradingOptionsCard } from "./_components/TradingOptionsCard";
import { ExecutionPreferencesCard } from "./_components/ExecutionPreferencesCard";
import { SafetyLimitsCard } from "./_components/SafetyLimitsCard";

export const dynamic = "force-dynamic";

export default function StrategyPage() {
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState<StrategySettings | null>(null);

  // collapsed by default (we’ll persist per-user in the NEXT step)
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Runtime state
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchJSON<{ ok: true; isTrading: boolean }>("/api/trading-state/runtime");
        if (!cancelled) setIsTrading(!!res.isTrading);
      } catch {
        if (!cancelled) setIsTrading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load strategy settings
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetchJSON<StrategyGetResponse>("/api/trading-state/strategy-settings");
        if (!cancelled) setCurrent(res.strategySettings);
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

  const patchStrategySettings = useCallback(async (patch: Partial<StrategySettings>) => {
    try {
      setSaving(true);
      setErr(null);

      const res = await fetchJSON<StrategyPostResponse>("/api/trading-state/strategy-settings", {
        method: "POST",
        body: JSON.stringify(patch),
      });

      setCurrent(res.strategySettings);
      return res.strategySettings;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const disabled = loading || saving;
  const lockLabel = isTrading ? "Read-only" : "Editable";

  return (
    <div className="min-h-screen">
      {/* Match Dashboard wrapper exactly */}
      <div className="mx-auto max-w-6xl px-6 pb-10">
        <div className="aura-page">
          {/* Summary strip only (top bar already provides title + system status) */}
          <div className="aura-summary-strip" aria-label="Strategy summary">
            <div className="aura-row-between">
              <div>
                <div className="aura-summary-title">Summary</div>
                <div className="aura-muted aura-text-xs aura-mt-6">Key settings snapshot.</div>
              </div>
              <div className="aura-muted aura-text-xs">{loading ? "Loading…" : " "}</div>
            </div>

            <div className="aura-mt-12 aura-health-strip">
              <div className="aura-health-pill aura-health-pill--static">
                <span className="aura-health-key">Symbol(s)</span>
                <span className="aura-health-val">
                  {current?.symbols?.length ? current.symbols.join(", ") : "—"}
                </span>
              </div>

              <div className="aura-health-pill aura-health-pill--static">
                <span className="aura-health-key">Sessions</span>
                <span className="aura-health-val">
                  {current
                    ? [current.sessions.asia ? "Asia" : null, current.sessions.london ? "London" : null, current.sessions.ny ? "NY" : null]
                        .filter(Boolean)
                        .join(", ") || "—"
                    : "—"}
                </span>
              </div>

              <div className="aura-health-pill aura-health-pill--static">
                <span className="aura-health-key">Risk</span>
                <span className="aura-health-val">{current ? `$${current.riskUsd} • RR ${current.rr}` : "—"}</span>
              </div>

              <div className="aura-health-pill aura-health-pill--static">
                <span className="aura-health-key">State</span>
                <span className="aura-health-val">{lockLabel}</span>
              </div>
            </div>
          </div>

          {err ? (
            <section className="aura-card">
              <div className="aura-card-title">Error</div>
              <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
            </section>
          ) : null}

          {/* Core */}
          <div className="aura-section-stack">
            <TradableSymbolsCard current={current} saving={saving} patchStrategySettings={patchStrategySettings} />

            <TradingSessionsCard
              current={current}
              saving={saving}
              disabled={disabled}
              setCurrent={setCurrent}
              setSaving={setSaving}
              setErr={setErr}
            />

            <RiskConfigurationCard
              current={current}
              saving={saving}
              disabled={disabled}
              setCurrent={setCurrent}
              setSaving={setSaving}
              setErr={setErr}
            />

            <PositionSizingCard current={current} />

            <SafetyLimitsCard current={current} saving={saving} patchStrategySettings={patchStrategySettings} />

            <section className="aura-section">
              <div className="aura-advanced-container">
                <div className="aura-advanced-header" onClick={() => setAdvancedOpen((v) => !v)}>
                  <div>
                    <div className="aura-card-title">Advanced Strategy Controls</div>
                    <div className="aura-muted aura-text-xs aura-mt-6">
                      Additional filters and execution preferences.
                    </div>
                  </div>
                  <span className="aura-advanced-chevron">{advancedOpen ? "−" : "+"}</span>
                </div>

                {advancedOpen && (
                  <div className="aura-advanced-content">
                    <TradingOptionsCard current={current} saving={saving} patchStrategySettings={patchStrategySettings} />
                    <ExecutionPreferencesCard
                      current={current}
                      saving={saving}
                      patchStrategySettings={patchStrategySettings}
                    />
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
