// src/app/app/strategy-setup/_components/SafetyLimitsCard.tsx
"use client";

import { useEffect, useState } from "react";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

function toIntOrNull(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function SafetyLimitsCard({ current, saving, patchStrategySettings }: Props) {
  const [maxDailyLossDraft, setMaxDailyLossDraft] = useState<string>("");
  const [maxDailyProfitDraft, setMaxDailyProfitDraft] = useState<string>("");
  const [maxConsecutiveLossesDraft, setMaxConsecutiveLossesDraft] =
    useState<string>("");
  const [autoPauseDraft, setAutoPauseDraft] = useState<boolean>(false);

  useEffect(() => {
    const mdl = current?.safety?.maxDailyLossUsd;
    const mdp = current?.safety?.maxDailyProfitUsd;
    const mcl = current?.safety?.maxConsecutiveLosses;
    const ap = current?.safety?.autoPauseEnabled;

    setMaxDailyLossDraft(typeof mdl === "number" ? String(mdl) : "");
    setMaxDailyProfitDraft(typeof mdp === "number" ? String(mdp) : "");
    setMaxConsecutiveLossesDraft(typeof mcl === "number" ? String(mcl) : "");
    setAutoPauseDraft(!!ap);
  }, [
    current?.safety?.maxDailyLossUsd,
    current?.safety?.maxDailyProfitUsd,
    current?.safety?.maxConsecutiveLosses,
    current?.safety?.autoPauseEnabled,
  ]);

  const isDisabled = !current || saving;

  const saveMaxDailyLoss = async () => {
    if (!current) return;
    if (!maxDailyLossDraft.trim()) return;

    const asInt = toIntOrNull(maxDailyLossDraft);
    if (asInt === null) return;

    await patchStrategySettings({
      safety: { ...current.safety, maxDailyLossUsd: asInt } as any,
    });
  };

  const saveMaxDailyProfit = async () => {
    if (!current) return;
    if (!maxDailyProfitDraft.trim()) return;

    const asInt = toIntOrNull(maxDailyProfitDraft);
    if (asInt === null) return;

    await patchStrategySettings({
      safety: { ...current.safety, maxDailyProfitUsd: asInt } as any,
    });
  };

  const saveMaxConsecutiveLosses = async () => {
    if (!current) return;
    if (!maxConsecutiveLossesDraft.trim()) return;

    const asInt = toIntOrNull(maxConsecutiveLossesDraft);
    if (asInt === null) return;

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

  const summary = (() => {
    if (!current) return "â€”";
    const loss =
      current.safety.maxDailyLossUsd > 0
        ? `Max loss $${current.safety.maxDailyLossUsd}/day`
        : "Max loss off";
    const profit =
      current.safety.maxDailyProfitUsd > 0
        ? `Profit target $${current.safety.maxDailyProfitUsd}/day`
        : "Profit target off";
    const streak =
      current.safety.maxConsecutiveLosses > 0
        ? `Streak ${current.safety.maxConsecutiveLosses}`
        : "Streak off";
    const ap = current.safety.autoPauseEnabled ? "Auto-pause on" : "Auto-pause off";
    return [loss, profit, streak, ap].join(" â€¢ ");
  })();

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Safety &amp; Limits</div>
          <div className="aura-muted aura-text-xs aura-mt-10">
            These are your â€œcircuit breakersâ€. Set any value to <span className="aura-mono">0</span>{" "}
            to turn it off.
          </div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">{saving ? "Savingâ€¦" : summary}</div>
        </div>
      </div>

      <div className="aura-mt-12">
        <div className={`aura-card-muted ${isDisabled ? "aura-disabled" : ""}`}>
          {/* Max daily loss */}
          <div className="aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-group-title">Max daily loss (USD)</div>
              <div className="aura-control-help">
                If your realised loss hits this number, Aura stops placing new trades for the day.
                (Set to 0 to disable.)
              </div>
            </div>

            <div className="aura-control-right aura-control-right--sm">
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

          {/* Max daily profit */}
          <div className="aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-group-title">Daily profit target (USD)</div>
              <div className="aura-control-help">
                If your realised profit reaches this number, Aura stops placing new trades for the day.
                (Set to 0 to disable.)
              </div>
            </div>

            <div className="aura-control-right aura-control-right--sm">
              <input
                className="aura-input"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 200"
                value={maxDailyProfitDraft}
                disabled={isDisabled}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]+$/.test(v)) setMaxDailyProfitDraft(v);
                }}
                onBlur={saveMaxDailyProfit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          </div>

          <div className="aura-divider" />

          {/* Max consecutive losses */}
          <div className="aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-group-title">Max consecutive losses</div>
              <div className="aura-control-help">
                If you hit this losing streak, Aura will auto-pause (if enabled).
                (Set to 0 to disable.)
              </div>
            </div>

            <div className="aura-control-right aura-control-right--sm">
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

          {/* Auto-pause */}
          <div className="aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-group-title">Auto-pause</div>
              <div className="aura-control-help">
                When enabled, Aura will pause itself after a safety trigger so it canâ€™t keep firing.
              </div>
            </div>

            <div className="aura-control-right aura-control-right--lg">
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
                  <span>On</span>
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
                  <span>Off</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="aura-muted aura-text-xs aura-mt-10">
        Note: these limits only stop <span className="aura-mono">new</span> trades. They donâ€™t close an
        existing open position.
      </p>
    </section>
  );
}

