// src/app/app/strategy/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  const summary = useMemo(() => {
    if (!current) return null;

    const symbols = current.symbols?.length ? current.symbols.join(", ") : "—";
    const sessions = [
      current.sessions.asia ? "Asia" : null,
      current.sessions.london ? "London" : null,
      current.sessions.ny ? "NY" : null,
    ]
      .filter(Boolean)
      .join(", ");

    const risk = `$${current.riskUsd} • RR ${current.rr} • Max stop ${current.maxStopTicks}t`;

    const sizing =
      current.sizing?.mode === "fixed_contracts"
        ? `Fixed (${current.sizing.fixedContracts})`
        : "Risk-based";

    const lockLabel = isTrading ? "Locked (Aura is running)" : "Editable";

    return { symbols, sessions: sessions || "—", risk, sizing, lockLabel };
  }, [current, isTrading]);

  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <div className="aura-page-title">Strategy Settings</div>
        <p className="aura-page-subtitle">
          Set your risk, sizing and safety limits. When you’re ready, start Aura from{" "}
          <span className="aura-mono">Live Control</span>.
        </p>
      </div>

      {/* Recommended setup */}
      <section className="aura-card aura-mt-24">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Recommended setup (2 minutes)</div>
            <p className="aura-muted aura-text-xs aura-mt-10">
              If you’re new, follow these steps and you’ll be safe. If you’re experienced,
              you can still keep it simple.
            </p>
          </div>

          <button
            type="button"
            className="aura-btn aura-btn-subtle"
            onClick={() => router.push("/app/live-control")}
          >
            Go to Live Control
          </button>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted">
            <div className="aura-group-title">1) Choose your market</div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              Pick <span className="aura-mono">MGC</span> (micro) for smaller risk per tick, or{" "}
              <span className="aura-mono">GC</span> (standard) if you’re intentionally trading larger size.
            </div>
          </div>

          <div className="aura-card-muted">
            <div className="aura-group-title">2) Set your max risk + max stop</div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              These two numbers control most of your safety. “Max stop (ticks)” is a hard cap
              so Aura can’t take trades with huge stops.
            </div>
          </div>

          <div className="aura-card-muted">
            <div className="aura-group-title">3) Add your safety limits</div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              Set a <span className="aura-mono">max daily loss</span> and a{" "}
              <span className="aura-mono">daily profit target</span> so Aura stops trading after a good
              or bad day.
            </div>
          </div>
        </div>
      </section>

      {/* Simple Strategy card (fixed for now) */}
      <section className="aura-card aura-mt-24">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Strategy</div>
            <p className="aura-muted aura-text-xs aura-mt-10">
              Aura is currently running one validated strategy. This page controls execution behaviour (risk,
              sizing, limits) - not the pattern logic.
            </p>
          </div>

          <div className="aura-right">
            <div className="aura-stat-label">315 CorePlus • Paper trading (for now)</div>
          </div>
        </div>
      </section>

      {/* Summary strip (compact + reassuring) */}
      <div className="aura-summary-strip aura-mt-24" aria-label="Strategy summary">
        <div className="aura-row-between">
          <div>
            <div className="aura-summary-title">Your current setup</div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              Quick snapshot (read-only). If anything looks wrong, adjust below.
            </div>
          </div>
          <div className="aura-muted aura-text-xs">{loading ? "Loading…" : summary?.lockLabel ?? "—"}</div>
        </div>

        <div className="aura-mt-12 aura-health-strip">
          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">Symbols</span>
            <span className="aura-health-val">{loading ? "…" : summary?.symbols ?? "—"}</span>
          </div>

          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">Risk</span>
            <span className="aura-health-val">{loading ? "…" : summary?.risk ?? "—"}</span>
          </div>

          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">Sizing</span>
            <span className="aura-health-val">{loading ? "…" : summary?.sizing ?? "—"}</span>
          </div>

          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">Sessions</span>
            <span className="aura-health-val">{loading ? "…" : summary?.sessions ?? "—"}</span>
          </div>

          <div className="aura-health-pill aura-health-pill--static">
            <span className="aura-health-key">Status</span>
            <span className="aura-health-val">{isTrading ? "Locked" : "Editable"}</span>
          </div>
        </div>
      </div>

      {err ? (
        <section className="aura-card aura-mt-24">
          <div className="aura-card-title">Error</div>
          <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
        </section>
      ) : null}

      {/* Lock header + locked content wrapper */}
      <div className="aura-lock-section">
        <div className="aura-row-between aura-mt-24">
          <div>
            <div className="aura-summary-title">
              {isTrading ? "Settings locked while Aura is running" : "Settings ready to edit"}
            </div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              {isTrading
                ? "To change anything here, pause Aura first. This prevents mid-trade surprises."
                : "Make changes below, then start Aura from Live Control when you’re ready."}
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
          {isTrading ? (
            <div
              className="aura-lock-overlay"
              onClick={() => {
                const ok = window.confirm(
                  "Settings are locked while Aura is running.\n\nPause Aura to edit.\n\nGo to Live Control now?"
                );
                if (ok) router.push("/app/live-control");
              }}
            />
          ) : null}

          <div className={`aura-section-stack ${isTrading ? "aura-locked" : ""}`}>
            {/* Core settings (what matters right now) */}
            <section className="aura-card">
              <div className="aura-card-title">Core settings</div>
              <p className="aura-muted aura-text-xs aura-mt-10">
                These are the only settings you need to configure for safe, clean execution.
              </p>
            </section>

            <TradableSymbolsCard
              current={current}
              saving={saving}
              patchStrategySettings={patchStrategySettings}
            />

            {/* Sessions: visible, but clearly marked as not enforced yet */}
            <section className="aura-card">
              <div className="aura-row-between">
                <div>
                  <div className="aura-card-title">Trading sessions</div>
                  <p className="aura-muted aura-text-xs aura-mt-10">
                    Choose the sessions you want Aura to trade.
                    <span className="aura-mono"> DEV NOTE:</span> stored now, but not enforced by the worker yet.
                  </p>
                </div>
                <div className="aura-right">
                  <div className="aura-stat-label">Not enforced yet</div>
                </div>
              </div>

              <div className="aura-mt-12">
                <TradingSessionsCard
                  current={current}
                  saving={saving}
                  disabled={disabled}
                  setCurrent={setCurrent}
                  setSaving={setSaving}
                  setErr={setErr}
                />
              </div>
            </section>

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

            <SafetyLimitsCard
              current={current}
              saving={saving}
              patchStrategySettings={patchStrategySettings}
            />

            {/* Advanced / coming soon */}
            <section className="aura-card">
              <div className="aura-card-title">Advanced settings (coming soon)</div>
              <p className="aura-muted aura-text-xs aura-mt-10">
                These are planned, but not active yet. They’re shown here so advanced traders can see what’s
                coming - without cluttering the core setup.
              </p>

              <div className="aura-mt-12 aura-grid-gap-10">
                <div className="aura-card-muted">
                  <div className="aura-group-title">Execution guardrails</div>
                  <div className="aura-muted aura-text-xs aura-mt-6">
                    Max trades per session • Trade stacking • Require flat before new entry
                    <br />
                    <span className="aura-mono">Status:</span> not implemented yet (worker does single-position only).
                  </div>
                </div>

                <div className="aura-card-muted">
                  <div className="aura-group-title">Entry quality filters</div>
                  <div className="aura-muted aura-text-xs aura-mt-6">
                    Candle body dominance • EMA filter • Entry timing
                    <br />
                    <span className="aura-mono">Status:</span> not implemented yet.
                  </div>
                </div>

                <div className="aura-card-muted">
                  <div className="aura-group-title">Session behaviour</div>
                  <div className="aura-muted aura-text-xs aura-mt-6">
                    Max stop-outs per session • Cooldown after stop-out
                    <br />
                    <span className="aura-mono">Status:</span> cooldown is a later phase (not soon).
                  </div>
                </div>

                <div className="aura-card-muted">
                  <div className="aura-group-title">More safety targets</div>
                  <div className="aura-muted aura-text-xs aura-mt-6">
                    Max daily loss • Max consecutive losses • Daily profit target
                    <br />
                    <span className="aura-mono">Status:</span> urgent to add in the worker next (UI is ready).
                  </div>
                </div>
              </div>
            </section>

            {/* Nice-to-haves */}
            <section className="aura-card">
              <div className="aura-card-title">Later</div>
              <p className="aura-muted aura-text-xs aura-mt-10">
                Per-symbol risk profiles, backtest summaries, strategy changelog/version history, and advanced
                filters (news windows, volatility/spread checks, execution slippage limits).
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
