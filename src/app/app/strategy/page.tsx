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

import { TradingSessionsCard } from "./_components/TradingSessionsCard";
import { RiskConfigurationCard } from "./_components/RiskConfigurationCard";
import { PositionSizingCard } from "./_components/PositionSizingCard";
import { TradingOptionsCard } from "./_components/TradingOptionsCard";
import { ExecutionPreferencesCard } from "./_components/ExecutionPreferencesCard";
import { SafetyLimitsCard } from "./_components/SafetyLimitsCard";

export const dynamic = "force-dynamic";

const ADVANCED_KEY = "aura-strategy-advanced-open";

export default function StrategyPage() {
  const router = useRouter();

  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState<StrategySettings | null>(null);

  // Collapsed by default, remembers per browser/user
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ADVANCED_KEY) === "true";
  });

  // Runtime state (locks editing while trading)
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
      <div>
        <div className="aura-page-title">Strategy Setup</div>
        <p className="aura-page-subtitle">
          Configure how Aura executes trades on your account.
        </p>
      </div>

      {err ? (
        <section className="aura-card">
          <div className="aura-card-title">Error</div>
          <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
        </section>
      ) : null}

      {/* Lock header */}
      <div className="aura-row-between">
        <div className="aura-muted aura-text-xs">
          {isTrading
            ? "Strategy settings are locked while Aura is running."
            : "Strategy settings are editable."}
        </div>

        <button
          type="button"
          className="aura-btn aura-btn-subtle"
          onClick={() => router.push("/app/live-control")}
        >
          {isTrading ? "Go to Live Control" : "Live Control"}
        </button>
      </div>

      <div className="aura-lock-wrap">
        {isTrading ? <div className="aura-lock-overlay" /> : null}

        <div className={isTrading ? "aura-section-stack aura-locked" : "aura-section-stack"}>
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

          <SafetyLimitsCard
            current={current}
            saving={saving}
            patchStrategySettings={patchStrategySettings}
          />

          {/* Advanced wrapper */}
          <section className="aura-card">
            <button
              type="button"
              className="aura-advanced-toggle"
              onClick={() => {
                setAdvancedOpen((v) => {
                  const next = !v;
                  localStorage.setItem(ADVANCED_KEY, String(next));
                  return next;
                });
              }}
              aria-expanded={advancedOpen}
            >
              <div className="aura-advanced-left">
                <div className="aura-card-title">Advanced</div>
                <div className="aura-muted aura-text-xs aura-mt-6">
                  Optional filters and execution preferences.
                </div>
              </div>
              <div className="aura-advanced-chevron">{advancedOpen ? "–" : "+"}</div>
            </button>

            {advancedOpen ? (
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
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
