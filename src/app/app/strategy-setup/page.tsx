// src/app/app/strategy-setup/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import type { StrategyGetResponse, StrategyPostResponse, StrategySettings } from "./_lib/types";
import { fetchJSON } from "./_lib/api";

import { StrategyRunStateBanner } from "./_components/StrategyRunStateBanner";
import { StrategySummaryStrip } from "./_components/StrategySummaryStrip";
import { StrategyTopCardsRow } from "./_components/StrategyTopCardsRow";
import { TradingSessionsCard } from "./_components/TradingSessionsCard";
import { RiskConfigurationCard } from "./_components/RiskConfigurationCard";
import { BrokersStatusCard } from "@/components/strategy/BrokersStatusCard";

export const dynamic = "force-dynamic";

type RuntimeRes = {
  ok: true;
  isTrading: boolean;
  isPaused: boolean;
  isKillSwitched: boolean;
};

export default function StrategyPage() {
  const [runtime, setRuntime] = useState<RuntimeRes | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState<StrategySettings | null>(null);
  const [enabledAccountsCount, setEnabledAccountsCount] = useState<number>(0);

  // collapsed by default (we’ll persist per-user in the NEXT step)
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const refreshRuntime = useCallback(async () => {
    try {
      const res = await fetchJSON<RuntimeRes>("/api/trading-state/runtime");
      setRuntime(res);
    } catch {
      // Fail safe: treat as not trading (editable) so we never block users accidentally.
      setRuntime({ ok: true, isTrading: false, isPaused: false, isKillSwitched: false });
    }
  }, []);

  // Runtime state
  useEffect(() => {
    refreshRuntime();
  }, [refreshRuntime]);

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

  const patchStrategySettings = useCallback(
    async (patch: Partial<StrategySettings>) => {
      try {
        // HARD GUARD: never save while running
        if (runtime?.isTrading) {
          setErr("Settings are locked while Aura is running. Pause Aura to edit.");
          throw new Error("locked");
        }

        setSaving(true);
        setErr(null);

        const res = await fetchJSON<StrategyPostResponse>("/api/trading-state/strategy-settings", {
          method: "POST",
          body: JSON.stringify(patch),
        });

        setCurrent(res.strategySettings);
        return res.strategySettings;
      } catch (e) {
        if (!(e instanceof Error && e.message === "locked")) {
          setErr(e instanceof Error ? e.message : String(e));
        }
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [runtime?.isTrading]
  );

  const isTrading = !!runtime?.isTrading;
  const disabled = loading || saving || isTrading;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10">
      <div className="aura-page">
        <StrategyRunStateBanner
          loading={!runtime}
          isTrading={!!runtime?.isTrading}
          isPaused={!!runtime?.isPaused}
          isKillSwitched={!!runtime?.isKillSwitched}
          onRuntimeRefresh={refreshRuntime}
        />

        <StrategySummaryStrip
          current={current}
          loading={loading}
          saving={saving}
          isTrading={isTrading}
          enabledAccountsCount={enabledAccountsCount}
        />

        {err ? (
          <section className="aura-card">
            <div className="aura-card-title">Error</div>
            <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
          </section>
        ) : null}

        {/* Core */}
        <div className="aura-section-stack">
          <StrategyTopCardsRow current={current} />
          
          <BrokersStatusCard
            isTrading={isTrading}
            onEnabledCountChange={setEnabledAccountsCount}
          />

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

        </div>
      </div>
    </div>
  );
}
