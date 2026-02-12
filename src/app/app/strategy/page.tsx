// src/app/app/strategy/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  StrategyGetResponse,
  StrategyPostResponse,
  StrategySettings,
} from "./_lib/types";

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
  const router = useRouter();

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
        const res = await fetchJSON<{ ok: true; isTrading: boolean }>(
          "/api/trading-state/runtime"
        );
        if (!cancelled) setIsTrading(!!res.isTrading);
      } catch {
        if (!cancelled) setIsTrading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load settings
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetchJSON<StrategyGetResponse>(
          "/api/trading-state/strategy-settings"
        );

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
        setSaving(true);
        setErr(null);

        const res = await fetchJSON<StrategyPostResponse>(
          "/api/trading-state/strategy-settings",
          {
            method: "POST",
            body: JSON.stringify(patch),
          }
        );

        setCurrent(res.strategySettings);
        return res.strategySettings;
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const disabled = loading || saving;

  return (
    <div className="mx-auto max-w-5xl aura-page">
      <div className="aura-page-header">
        <h1 className="aura-page-title">Strategy Setup</h1>
        <p className="aura-page-subtitle">
          Configure how Aura trades on your account.
        </p>
      </div>

      {err && (
        <section className="aura-card">
          <div className="aura-card-title">Error</div>
          <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
        </section>
      )}

      {/* ================= CORE SETUP ================= */}
      <section className="aura-section">
        <div className="aura-section-header">
          <h2>Core Setup</h2>
          <p className="aura-muted aura-text-xs">
            Where and how Aura will trade.
          </p>
        </div>

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

        <PositionSizingCard
          current={current}
          saving={saving}
          patchStrategySettings={patchStrategySettings}
        />
      </section>

      {/* ================= SAFETY ================= */}
      <section className="aura-section">
        <div className="aura-section-header">
          <h2>Safety & Protection</h2>
          <p className="aura-muted aura-text-xs">
            Circuit breakers to protect your account.
          </p>
        </div>

        <SafetyLimitsCard
          current={current}
          saving={saving}
          patchStrategySettings={patchStrategySettings}
        />
      </section>

      {/* ================= ADVANCED ================= */}
      <section className="aura-section">
        <div
          className="aura-advanced-toggle"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <div>
            <h2>Advanced Strategy Controls</h2>
            <p className="aura-muted aura-text-xs">
              Additional filters and execution preferences.
            </p>
          </div>
          <span className="aura-advanced-chevron">
            {advancedOpen ? "−" : "+"}
          </span>
        </div>

        {advancedOpen && (
          <div className="aura-advanced-content">
            <TradingOptionsCard
              current={current}
              saving={saving}
              patchStrategySettings={patchStrategySettings}
            />

            <ExecutionPreferencesCard
              current={current}
              saving={saving}
              patchStrategySettings={patchStrategySettings}
            />
          </div>
        )}
      </section>
    </div>
  );
}
