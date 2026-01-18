"use client";

import { useEffect, useState } from "react";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

export function SafetyLimitsCard({ current, saving, patchStrategySettings }: Props) {
  const [maxDailyLossDraft, setMaxDailyLossDraft] = useState<string>("");
  const [maxConsecutiveLossesDraft, setMaxConsecutiveLossesDraft] =
    useState<string>("");
  const [autoPauseDraft, setAutoPauseDraft] = useState<boolean>(false);

  useEffect(() => {
    const mdl = current?.safety?.maxDailyLossUsd;
    const mcl = current?.safety?.maxConsecutiveLosses;
    const ap = current?.safety?.autoPauseEnabled;

    setMaxDailyLossDraft(typeof mdl === "number" ? String(mdl) : "");
    setMaxConsecutiveLossesDraft(typeof mcl === "number" ? String(mcl) : "");
    setAutoPauseDraft(!!ap);
  }, [
    current?.safety?.maxDailyLossUsd,
    current?.safety?.maxConsecutiveLosses,
    current?.safety?.autoPauseEnabled,
  ]);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Safety &amp; Limits</div>
          <div className="aura-muted aura-text-xs aura-mt-10">
            System-level guardrails. 0 disables numeric limits.
          </div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">
            {saving
              ? "Saving…"
              : current
              ? `${current.safety.maxDailyLossUsd ? `$${current.safety.maxDailyLossUsd}/day` : "Daily off"} • ${
                  current.safety.maxConsecutiveLosses
                    ? `${current.safety.maxConsecutiveLosses} losses`
                    : "Streak off"
                } • ${current.safety.autoPauseEnabled ? "Auto-pause on" : "Auto-pause off"}`
              : "—"}
          </div>
        </div>
      </div>

      <div className="aura-mt-12">
        {(() => {
          const isDisabled = !current || saving;

          const saveMaxDailyLoss = async () => {
            if (!current) return;
            if (!maxDailyLossDraft.trim()) return;

            const n = Number(maxDailyLossDraft);
            if (!Number.isFinite(n)) return;

            const asInt = Math.max(0, Math.floor(n));

            await patchStrategySettings({
              safety: { ...current.safety, maxDailyLossUsd: asInt } as any,
            });
          };

          const saveMaxConsecutiveLosses = async () => {
            if (!current) return;
            if (!maxConsecutiveLossesDraft.trim()) return;

            const n = Number(maxConsecutiveLossesDraft);
            if (!Number.isFinite(n)) return;

            const asInt = Math.max(0, Math.floor(n));

            await patchStrategySettings({
              safety: { ...current.safety, maxConsecutiveLosses: asInt } as any,
            });
          };

          const setAutoPause = async (next: boolean) => {
            if (!current) return;

            const prev = autoPauseDraft;
            setAutoPauseDraft(next);

            try {
              await patchStrategySettings({
                safety: { ...current.safety, autoPauseEnabled: next } as any,
              });
            } catch (e) {
              setAutoPauseDraft(prev);
              throw e;
            }
          };

          return (
            <div className={`aura-card-muted ${isDisabled ? "aura-disabled" : ""}`}>
              <div className="aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-group-title">Max daily loss (USD)</div>
                  <div className="aura-control-help">
                    If reached, Aura will stop trading for the day. 0 disables.
                  </div>
                </div>

                <div className="aura-control-right" style={{ minWidth: 180 }}>
                  <input
                    className="aura-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 300"
                    value={maxDailyLossDraft}
                    disabled={isDisabled}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]+$/.test(v)) setMaxDailyLossDraft(v);
                    }}
                    onBlur={saveMaxDailyLoss}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
              </div>

              <div className="aura-divider" />

              <div className="aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-group-title">Max consecutive losses</div>
                  <div className="aura-control-help">
                    If hit, Aura will pause trading until the next session. 0 disables.
                  </div>
                </div>

                <div className="aura-control-right" style={{ minWidth: 180 }}>
                  <input
                    className="aura-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 3"
                    value={maxConsecutiveLossesDraft}
                    disabled={isDisabled}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]+$/.test(v))
                        setMaxConsecutiveLossesDraft(v);
                    }}
                    onBlur={saveMaxConsecutiveLosses}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
              </div>

              <div className="aura-divider" />

              <div className="aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-group-title">Auto-pause</div>
                  <div className="aura-control-help">
                    When enabled, Aura can pause itself after safety triggers.
                  </div>
                </div>

                <div className="aura-control-right" style={{ minWidth: 260 }}>
                  <div className="aura-pill-group" role="group" aria-label="Auto-pause">
                    <button
                      type="button"
                      className="aura-pill-toggle"
                      aria-pressed={autoPauseDraft === true}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        setAutoPause(true);
                      }}
                    >
                      <span className="aura-pill-indicator" />
                      <span>Enabled</span>
                    </button>

                    <button
                      type="button"
                      className="aura-pill-toggle"
                      aria-pressed={autoPauseDraft === false}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        setAutoPause(false);
                      }}
                    >
                      <span className="aura-pill-indicator" />
                      <span>Disabled</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <p className="aura-muted aura-text-xs aura-mt-10">
        Some safeguards are always enforced at the system level, even if you disable
        these thresholds.
      </p>
    </section>
  );
}
