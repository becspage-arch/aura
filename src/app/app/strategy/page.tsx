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

  // This should be true when Aura is actively running / trading for the user.
  const [isTrading, setIsTrading] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [current, setCurrent] = useState<StrategySettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // TODO: Replace this with your real endpoint
        // Expected response shape: { ok: true, isTrading: boolean }
        const res = await fetchJSON<{ ok: true; isTrading: boolean }>(
          "/api/trading-state/runtime"
        );
        if (cancelled) return;
        setIsTrading(!!res.isTrading);
      } catch {
        // If runtime state isn't available yet, default to editable.
        if (!cancelled) setIsTrading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const disabled = loading || saving;

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

  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <p className="aura-page-subtitle">
          Configure how Aura executes the strategy on your account.
        </p>
      </div>

      {/* Strategy Summary (read-only strip) */}
      <div className="aura-summary-strip" aria-label="Strategy summary">
        <div className="aura-row-between">
          <div>
            <div className="aura-summary-title">Summary</div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              Read-only snapshot of the key settings on this page.
            </div>
          </div>
          <div className="aura-muted aura-text-xs">
            {loading ? "Loading…" : "Overview"}
          </div>
        </div>

        <div className="aura-mt-12 aura-health-strip">
          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">Mode</span>
            <span className="aura-health-val">{current?.mode ?? "—"}</span>
          </div>

          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">Strategy</span>
            <span className="aura-health-val">315 CorePlus</span>
          </div>

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
                ? [
                    current.sessions.asia ? "Asia" : null,
                    current.sessions.london ? "London" : null,
                    current.sessions.ny ? "NY" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                : "—"}
            </span>
          </div>

          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">Risk</span>
            <span className="aura-health-val">
              {current ? `$${current.riskUsd} • RR ${current.rr}` : "—"}
            </span>
          </div>

          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">State</span>
            <span className="aura-health-val">—</span>
          </div>
        </div>
      </div>

      {err ? (
        <section className="aura-card">
          <div className="aura-card-title">Error</div>
          <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
        </section>
      ) : null}

      {/* Strategy lock header + locked content wrapper */}
      <div className="aura-lock-section">
        <div className="aura-row-between aura-mt-24">
          <div>
            <div className="aura-summary-title">
              {isTrading ? "Strategy Locked" : "Strategy Editable"}
            </div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              {isTrading
                ? "Strategy settings are locked while Aura is trading. Pause Aura to edit."
                : "Strategy settings are currently editable. When you are happy with your settings, start Aura from the Live Control page."}
            </div>
          </div>

          <div
            className={`aura-lock-badge ${
              isTrading ? "aura-lock-badge--locked" : "aura-lock-badge--editable"
            }`}
          >
            <span className="aura-lock-dot" />
            <span>{isTrading ? "Read-only" : "Editable"}</span>
          </div>
        </div>

        <div className="aura-lock-wrap">
          {/* If locked, show overlay that catches ALL interaction */}
          {isTrading ? (
            <div
              className="aura-lock-overlay"
              onClick={() => {
                const ok = window.confirm(
                  "Strategy settings are locked while Aura is trading.\n\nPause Aura to edit.\n\nGo to Live Control now?"
                );
                if (ok) router.push("/app/live-control");
              }}
            />
          ) : null}

          {/* Everything below this point is considered the "locked area" */}
          <div className={`aura-section-stack ${isTrading ? "aura-locked" : ""}`}>
            {/* Strategy Mode */}
            <section className="aura-card">
              <div className="aura-card-title">Strategy Mode</div>

              <div className="aura-mt-12 aura-grid-gap-10">
                <div className="aura-card-muted">
                  <div className="aura-row-between">
                    <span>Paper Trading</span>
                    <span className="aura-muted">Default</span>
                  </div>
                  <p className="aura-muted aura-text-xs aura-mt-6">
                    Aura simulates trades using real market data without placing live
                    orders.
                  </p>
                </div>

                <div className="aura-card-muted">
                  <div className="aura-row-between">
                    <span>Live Trading</span>
                    <span className="aura-muted">Disabled</span>
                  </div>
                  <p className="aura-muted aura-text-xs aura-mt-6">
                    Executes real orders through your connected broker account.
                    Additional confirmations will be required before enabling.
                  </p>
                </div>
              </div>
            </section>

            {/* Strategy Preset */}
            <section className="aura-card">
              <div className="aura-card-title">Strategy Preset</div>

              <div className="aura-mt-12 aura-card-muted">
                <div className="aura-row-between">
                  <span>Active Strategy</span>
                  <span className="aura-muted">315 CorePlus</span>
                </div>
                <p className="aura-muted aura-text-xs aura-mt-6">
                  Aura currently operates a single validated production strategy.
                  Core logic is fixed to protect consistency and execution quality.
                </p>
              </div>
            </section>

            <TradableSymbolsCard
              current={current}
              saving={saving}
              patchStrategySettings={patchStrategySettings}
            />

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

            <SafetyLimitsCard
              current={current}
              saving={saving}
              patchStrategySettings={patchStrategySettings}
            />

            {/* Coming soon */}
            <section className="aura-card">
              <div className="aura-card-title">Coming Soon</div>
              <p className="aura-muted aura-text-xs aura-mt-10">
                Per-symbol risk profiles, backtest summaries, strategy changelog/version
                history, and advanced filters (news windows, volatility/spread checks,
                execution slippage limits).
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
