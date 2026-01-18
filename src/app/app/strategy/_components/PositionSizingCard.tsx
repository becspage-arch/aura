"use client";

import { useEffect, useState } from "react";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

export function PositionSizingCard({
  current,
  saving,
  patchStrategySettings,
}: Props) {
  const [fixedContractsDraft, setFixedContractsDraft] = useState<string>("");

  useEffect(() => {
    const v = current?.sizing?.fixedContracts;
    setFixedContractsDraft(typeof v === "number" ? String(v) : "");
  }, [current?.sizing?.fixedContracts]);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Position Sizing</div>
          <div className="aura-muted aura-mt-6">Choose how Aura sizes positions.</div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">
            {(() => {
              const mode = current?.sizing?.mode ?? "risk_based";
              const fc = current?.sizing?.fixedContracts;
              if (mode === "fixed_contracts") {
                return `Fixed (${typeof fc === "number" ? fc : "—"})`;
              }
              return "Risk-based";
            })()}
          </div>
        </div>
      </div>

      <div className="aura-mt-12">
        {(() => {
          const mode = current?.sizing?.mode ?? "risk_based";

          const setMode = async (next: "risk_based" | "fixed_contracts") => {
            if (!current) return;
            await patchStrategySettings({
              sizing: {
                ...current.sizing,
                mode: next,
              },
            });
          };

          const saveFixedContracts = async () => {
            if (!current) return;

            // empty means "do nothing"
            if (!fixedContractsDraft.trim()) return;

            const n = Number(fixedContractsDraft);
            if (!Number.isFinite(n)) return;

            const asInt = Math.max(1, Math.floor(n));

            await patchStrategySettings({
              sizing: {
                ...current.sizing,
                fixedContracts: asInt,
              },
            });
          };

          const isDisabled = !current || saving;

          return (
            <div className="aura-grid-gap-12">
              <div
                className="aura-select-grid"
                role="group"
                aria-label="Position sizing"
              >
                {/* Risk-based */}
                <div
                  className="aura-select-card"
                  role="button"
                  tabIndex={0}
                  aria-pressed={mode === "risk_based"}
                  aria-disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    setMode("risk_based");
                  }}
                  onKeyDown={(e) => {
                    if (isDisabled) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setMode("risk_based");
                    }
                  }}
                >
                  <div className="aura-select-card__top">
                    <div>
                      <div className="aura-select-card__title">Risk-based</div>
                      <div className="aura-select-card__desc">
                        Uses stop distance to size the position so your USD risk stays
                        consistent.
                      </div>
                    </div>
                    <span className="aura-select-card__dot" />
                  </div>
                </div>

                {/* Fixed contracts */}
                <div
                  className="aura-select-card"
                  role="button"
                  tabIndex={0}
                  aria-pressed={mode === "fixed_contracts"}
                  aria-disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    setMode("fixed_contracts");
                  }}
                  onKeyDown={(e) => {
                    if (isDisabled) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setMode("fixed_contracts");
                    }
                  }}
                >
                  <div className="aura-select-card__top">
                    <div>
                      <div className="aura-select-card__title">Fixed contracts</div>
                      <div className="aura-select-card__desc">
                        Uses a fixed contract count per trade. Useful for testing and
                        simple rule sets.
                      </div>
                    </div>
                    <span className="aura-select-card__dot" />
                  </div>

                  {mode === "fixed_contracts" ? (
                    <div className="aura-select-card__content">
                      <div className="aura-control-row">
                        <div className="aura-control-meta">
                          <div className="aura-control-title">
                            Contracts per trade
                          </div>
                          <div className="aura-control-help">
                            Minimum 1. Saved when you click away or press Enter.
                          </div>
                        </div>

                        <div className="aura-control-right" style={{ minWidth: 160 }}>
                          <input
                            className="aura-input"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="e.g. 1"
                            value={fixedContractsDraft}
                            disabled={isDisabled}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^[0-9]+$/.test(v))
                                setFixedContractsDraft(v);
                            }}
                            onBlur={saveFixedContracts}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="aura-muted aura-text-xs">
                Tip: Risk-based sizing is recommended for consistent USD risk.
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
