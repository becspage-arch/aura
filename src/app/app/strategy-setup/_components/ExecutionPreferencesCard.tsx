// src/app/app/strategy-setup/_components/ExecutionPreferencesCard.tsx
"use client";

import { useEffect, useState } from "react";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

export function ExecutionPreferencesCard({
  current,
  saving,
  patchStrategySettings,
}: Props) {
  const [maxTradesDraft, setMaxTradesDraft] = useState<string>("");

  useEffect(() => {
    const mt = current?.coreplus315?.maxTradesPerSession;
    setMaxTradesDraft(typeof mt === "number" ? String(mt) : "");
  }, [current?.coreplus315?.maxTradesPerSession]);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Execution Preferences</div>
          <div className="aura-muted aura-text-xs aura-mt-10">
            Controls how often Aura is allowed to act. These settings donâ€™t change
            the strategy logic - only the execution guardrails.
          </div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">
            {saving
              ? "Savingâ€¦"
              : current
              ? [
                  current.execution.allowMultipleTradesPerSession
                    ? "Multi-trade"
                    : "Single-trade",
                  current.execution.allowTradeStacking ? "Stacking" : "No stacking",
                  current.execution.requireFlatBeforeNewEntry
                    ? "Flat first"
                    : "Can re-enter",
                ].join(" â€¢ ")
              : "â€”"}
          </div>
        </div>
      </div>

      <div className="aura-mt-12 aura-grid-gap-10">
        {/* Max trades per session */}
        {(() => {
          const isDisabled = !current || saving;

          const saveMaxTrades = async () => {
            if (!current) return;
            if (!maxTradesDraft.trim()) return;

            const n = Number(maxTradesDraft);
            if (!Number.isFinite(n)) return;

            const asInt = Math.max(0, Math.floor(n)); // 0 disables

            await patchStrategySettings({
              coreplus315: {
                ...current.coreplus315,
                maxTradesPerSession: asInt,
              },
            });
          };

          return (
            <div className={`aura-card-muted ${isDisabled ? "aura-disabled" : ""}`}>
              <div className="aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-group-title">Max trades per session</div>
                  <div className="aura-control-help">
                    Caps the number of trades Aura can take in a session. Set to 0 to disable.
                  </div>
                </div>

                <div className="aura-control-right aura-control-right--sm">
                  <input
                    className="aura-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 1"
                    value={maxTradesDraft}
                    disabled={isDisabled}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]+$/.test(v)) setMaxTradesDraft(v);
                    }}
                    onBlur={saveMaxTrades}
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

        {/* Execution rules */}
        <div className="aura-card-muted">
          {(() => {
            const isDisabled = !current || saving;

            const setExec = async (
              key:
                | "allowMultipleTradesPerSession"
                | "allowTradeStacking"
                | "requireFlatBeforeNewEntry",
              value: boolean
            ) => {
              if (!current) return;

              await patchStrategySettings({
                execution: { [key]: value } as any,
              });
            };

            const rows: Array<{
              key:
                | "allowMultipleTradesPerSession"
                | "allowTradeStacking"
                | "requireFlatBeforeNewEntry";
              title: string;
              help: string;
            }> = [
              {
                key: "allowMultipleTradesPerSession",
                title: "Allow multiple trades per session",
                help: "If off, Aura will only take one trade per session.",
              },
              {
                key: "allowTradeStacking",
                title: "Allow trade stacking",
                help: "If on, Aura may add positions when new valid setups appear.",
              },
              {
                key: "requireFlatBeforeNewEntry",
                title: "Require flat before new entry",
                help: "If on, Aura wonâ€™t enter a new trade until the prior position is flat.",
              },
            ];

            return (
              <div className={isDisabled ? "aura-disabled" : ""}>
                {rows.map((row, idx) => {
                  const on = !!current?.execution?.[row.key];

                  return (
                    <div key={row.key}>
                      <div className="aura-control-row">
                        <div className="aura-control-meta">
                          <div className="aura-group-title">{row.title}</div>
                          <div className="aura-control-help">{row.help}</div>
                        </div>

                        <div className="aura-control-right aura-control-right--lg">
                          <div
                            className="aura-pill-group"
                            role="group"
                            aria-label={row.title}
                          >
                            <button
                              type="button"
                              className="aura-pill-toggle"
                              aria-pressed={on}
                              disabled={isDisabled}
                              onClick={() => {
                                if (isDisabled) return;
                                setExec(row.key, true);
                              }}
                            >
                              <span className="aura-pill-indicator" />
                              <span>Enabled</span>
                            </button>

                            <button
                              type="button"
                              className="aura-pill-toggle"
                              aria-pressed={!on}
                              disabled={isDisabled}
                              onClick={() => {
                                if (isDisabled) return;
                                setExec(row.key, false);
                              }}
                            >
                              <span className="aura-pill-indicator" />
                              <span>Disabled</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {idx < rows.length - 1 && <div className="aura-divider" />}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
}

