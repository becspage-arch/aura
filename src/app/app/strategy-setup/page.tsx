// src/app/app/strategy-setup/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import type { StrategyGetResponse, StrategyPostResponse, StrategySettings } from "./_lib/types";
import { fetchJSON } from "./_lib/api";

import { StrategySummaryStrip } from "./_components/StrategySummaryStrip";
import { StrategyTopCardsRow } from "./_components/StrategyTopCardsRow";
import { TradingSessionsCard } from "./_components/TradingSessionsCard";
import { RiskConfigurationCard } from "./_components/RiskConfigurationCard";
import { TradingOptionsCard } from "./_components/TradingOptionsCard";
import { ExecutionPreferencesCard } from "./_components/ExecutionPreferencesCard";
import { SafetyLimitsCard } from "./_components/SafetyLimitsCard";

import { emitToast } from "@/components/toastBus";

export const dynamic = "force-dynamic";

export default function StrategyPage() {
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState<StrategySettings | null>(null);

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
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setErr(msg);

        emitToast({
          title: "Strategy Setup",
          body: `Failed to load settings - ${msg}`,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const patchStrategySettings = useCallback(
    async (patch: Partial<StrategySettings>) => {
      if (isTrading) {
        emitToast({
          title: "Locked",
          body: "Pause Aura to edit settings",
        });
        throw new Error("Locked while Aura is running");
      }

      try {
        setSaving(true);
        setErr(null);

        const res = await fetchJSON<StrategyPostResponse>("/api/trading-state/strategy-settings", {
          method: "POST",
          body: JSON.stringify(patch),
        });

        setCurrent(res.strategySettings);

        emitToast({
          title: "Saved",
          body: "Strategy settings updated",
        });

        return res.strategySettings;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);

        emitToast({
          title: "Save failed",
          body: msg,
        });

        throw e;
      } finally {
        setSaving(false);
      }
    },
    [isTrading]
  );

  const disabled = loading || saving || isTrading;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10">
      <div className="aura-page">
        <StrategySummaryStrip current={current} loading={loading} saving={saving} isTrading={isTrading} />

        {err ? (
          <section className="aura-card">
            <div className="aura-card-title">Error</div>
            <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
          </section>
        ) : null}

        <div className="aura-section-stack">
          <StrategyTopCardsRow current={current} />

          <TradingSessionsCard
            current={current}
            saving={saving}
            disabled={disabled}
            patchStrategySettings={patchStrategySettings}
          />

          <RiskConfigurationCard
            current={current}
            saving={saving}
            disabled={disabled}
            patchStrategySettings={patchStrategySettings}
          />

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
                  <ExecutionPreferencesCard current={current} saving={saving} patchStrategySettings={patchStrategySettings} />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
