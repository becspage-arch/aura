"use client";

import { useEffect, useState } from "react";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

export function TradingOptionsCard({
  current,
  saving,
  patchStrategySettings,
}: Props) {
  const [maxStopoutsDraft, setMaxStopoutsDraft] = useState<string>("");
  const [cooldownDraft, setCooldownDraft] = useState<string>("");

  const [bodyDominanceDraft, setBodyDominanceDraft] = useState<string>("");
  const [emaEnabledDraft, setEmaEnabledDraft] = useState<boolean>(false);
  const [entryTimingDraft, setEntryTimingDraft] = useState<
    "immediate" | "wait_confirm"
  >("immediate");

  useEffect(() => {
    const ms = current?.coreplus315?.maxStopoutsPerSession;
    const cd = current?.coreplus315?.cooldownMinutesAfterStopout;

    setMaxStopoutsDraft(typeof ms === "number" ? String(ms) : "");
    setCooldownDraft(typeof cd === "number" ? String(cd) : "");
  }, [
    current?.coreplus315?.maxStopoutsPerSession,
    current?.coreplus315?.cooldownMinutesAfterStopout,
  ]);

  useEffect(() => {
    const bd = current?.coreplus315?.requireBodyDominancePct;
    const ema = current?.coreplus315?.emaFilterEnabled;
    const et = current?.coreplus315?.entryTiming;

    setBodyDominanceDraft(typeof bd === "number" ? String(bd) : "");
    setEmaEnabledDraft(!!ema);
    setEntryTimingDraft(et ?? "immediate");
  }, [
    current?.coreplus315?.requireBodyDominancePct,
    current?.coreplus315?.emaFilterEnabled,
    current?.coreplus315?.entryTiming,
  ]);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Trading Options</div>
          <div className="aura-muted aura-text-xs aura-mt-10">
            Guardrails and quality filters for execution.
          </div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">
            {current?.coreplus315
              ? `Stop-outs ${current.coreplus315.maxStopoutsPerSession} • Cooldown ${current.coreplus315.cooldownMinutesAfterStopout}m`
              : "—"}
          </div>
        </div>
      </div>

      <div className="aura-mt-12 aura-grid-gap-12">
        {/* Group 1: Session Guardrails (BOUND) */}
        <div className="aura-card-muted">
          <div className="aura-group-header">
            <div>
              <div className="aura-group-title">Session Guardrails</div>
              <div className="aura-control-help">
                Limits after losses so Aura can pause and recover.
              </div>
            </div>
            <div className="aura-muted aura-text-xs">
              {saving ? "Saving…" : "Auto-save"}
            </div>
          </div>

          <div className="aura-divider" />

          {(() => {
            const isDisabled = !current || saving;

            const saveMaxStopouts = async () => {
              if (!current) return;
              if (!maxStopoutsDraft.trim()) return;

              const n = Number(maxStopoutsDraft);
              if (!Number.isFinite(n)) return;

              const asInt = Math.max(0, Math.floor(n));

              await patchStrategySettings({
                coreplus315: {
                  ...current.coreplus315,
                  maxStopoutsPerSession: asInt,
                },
              });
            };

            const saveCooldown = async () => {
              if (!current) return;
              if (!cooldownDraft.trim()) return;

              const n = Number(cooldownDraft);
              if (!Number.isFinite(n)) return;

              const asInt = Math.max(0, Math.floor(n));

              await patchStrategySettings({
                coreplus315: {
                  ...current.coreplus315,
                  cooldownMinutesAfterStopout: asInt,
                },
              });
            };

            return (
              <div className={isDisabled ? "aura-disabled" : ""}>
                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">
                      Max stop-outs per session
                    </div>
                    <div className="aura-control-help">
                      Number of stop-outs allowed before Aura pauses for the rest of
                      the session. 0 disables.
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 140 }}>
                    <input
                      className="aura-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 2"
                      value={maxStopoutsDraft}
                      disabled={isDisabled}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]+$/.test(v))
                          setMaxStopoutsDraft(v);
                      }}
                      onBlur={saveMaxStopouts}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="aura-divider" />

                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">
                      Cooldown after stop-out (minutes)
                    </div>
                    <div className="aura-control-help">
                      How long Aura waits before trading again after a stop-out. 0
                      disables.
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 140 }}>
                    <input
                      className="aura-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 15"
                      value={cooldownDraft}
                      disabled={isDisabled}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]+$/.test(v))
                          setCooldownDraft(v);
                      }}
                      onBlur={saveCooldown}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Group 2: Entry Quality Filters (BOUND) */}
        <div className="aura-card-muted">
          {(() => {
            const isDisabled = !current || saving;

            const saveBodyDominance = async () => {
              if (!current) return;
              if (!bodyDominanceDraft.trim()) return;

              const n = Number(bodyDominanceDraft);
              if (!Number.isFinite(n)) return;

              const pct = Math.max(50, Math.min(99, Math.floor(n)));

              await patchStrategySettings({
                coreplus315: {
                  ...current.coreplus315,
                  requireBodyDominancePct: pct,
                },
              });
            };

            const toggleEma = async () => {
              if (!current) return;
              const next = !emaEnabledDraft;
              setEmaEnabledDraft(next);

              await patchStrategySettings({
                coreplus315: {
                  ...current.coreplus315,
                  emaFilterEnabled: next,
                },
              });
            };

            const setTiming = async (next: "immediate" | "wait_confirm") => {
              if (!current) return;
              setEntryTimingDraft(next);

              await patchStrategySettings({
                coreplus315: {
                  ...current.coreplus315,
                  entryTiming: next,
                },
              });
            };

            return (
              <div className={isDisabled ? "aura-disabled" : ""}>
                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">
                      Require candle body dominance (%)
                    </div>
                    <div className="aura-control-help">
                      Minimum % of the candle body that must be on one side of the EMA
                      to qualify. (Recommended: 90)
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 140 }}>
                    <input
                      className="aura-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 90"
                      value={bodyDominanceDraft}
                      disabled={isDisabled}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]+$/.test(v))
                          setBodyDominanceDraft(v);
                      }}
                      onBlur={saveBodyDominance}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="aura-divider" />

                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">
                      Expansion candle EMA filter
                    </div>
                    <div className="aura-control-help">
                      When enabled, Aura requires additional EMA confirmation before
                      allowing entries.
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 260 }}>
                    <div
                      className="aura-select-grid"
                      role="group"
                      aria-label="EMA filter toggle"
                    >
                      <div
                        className="aura-select-card"
                        role="button"
                        tabIndex={0}
                        aria-pressed={emaEnabledDraft === true}
                        aria-disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          if (!emaEnabledDraft) toggleEma();
                        }}
                        onKeyDown={(e) => {
                          if (isDisabled) return;
                          if (
                            (e.key === "Enter" || e.key === " ") &&
                            !emaEnabledDraft
                          ) {
                            e.preventDefault();
                            toggleEma();
                          }
                        }}
                      >
                        <div className="aura-select-card__top">
                          <div>
                            <div className="aura-select-card__title">Enabled</div>
                            <div className="aura-select-card__desc">Stricter filtering</div>
                          </div>
                          <span className="aura-select-card__dot" />
                        </div>
                      </div>

                      <div
                        className="aura-select-card"
                        role="button"
                        tabIndex={0}
                        aria-pressed={emaEnabledDraft === false}
                        aria-disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          if (emaEnabledDraft) toggleEma();
                        }}
                        onKeyDown={(e) => {
                          if (isDisabled) return;
                          if (
                            (e.key === "Enter" || e.key === " ") &&
                            emaEnabledDraft
                          ) {
                            e.preventDefault();
                            toggleEma();
                          }
                        }}
                      >
                        <div className="aura-select-card__top">
                          <div>
                            <div className="aura-select-card__title">Disabled</div>
                            <div className="aura-select-card__desc">More permissive</div>
                          </div>
                          <span className="aura-select-card__dot" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="aura-divider" />

                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">Entry timing window</div>
                    <div className="aura-control-help">
                      Immediate enters on signal. Wait-for-confirm delays entry until
                      confirmation.
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 260 }}>
                    <div
                      className="aura-select-grid"
                      role="group"
                      aria-label="Entry timing"
                    >
                      <div
                        className="aura-select-card"
                        role="button"
                        tabIndex={0}
                        aria-pressed={entryTimingDraft === "immediate"}
                        aria-disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          setTiming("immediate");
                        }}
                        onKeyDown={(e) => {
                          if (isDisabled) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setTiming("immediate");
                          }
                        }}
                      >
                        <div className="aura-select-card__top">
                          <div>
                            <div className="aura-select-card__title">Immediate</div>
                            <div className="aura-select-card__desc">Faster entries</div>
                          </div>
                          <span className="aura-select-card__dot" />
                        </div>
                      </div>

                      <div
                        className="aura-select-card"
                        role="button"
                        tabIndex={0}
                        aria-pressed={entryTimingDraft === "wait_confirm"}
                        aria-disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          setTiming("wait_confirm");
                        }}
                        onKeyDown={(e) => {
                          if (isDisabled) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setTiming("wait_confirm");
                          }
                        }}
                      >
                        <div className="aura-select-card__top">
                          <div>
                            <div className="aura-select-card__title">Wait for confirm</div>
                            <div className="aura-select-card__desc">Higher confirmation</div>
                          </div>
                          <span className="aura-select-card__dot" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
