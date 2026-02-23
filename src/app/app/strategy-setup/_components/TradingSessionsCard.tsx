// src/app/app/strategy-setup/_components/TradingSessionsCard.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

export function TradingSessionsCard({ current, saving, disabled, patchStrategySettings }: Props) {
  const summary = saving
    ? "Saving…"
    : current
    ? ([
        current.sessions.asia ? "Asia" : null,
        current.sessions.london ? "London" : null,
        current.sessions.ny ? "New York" : null,
      ]
        .filter(Boolean)
        .join(", ") || "None selected")
    : "—";

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Trading Sessions</div>
          <div className="aura-muted aura-text-xs aura-mt-6">Select when Aura is allowed to trade.</div>
        </div>

        <div className="aura-muted aura-text-xs">{summary}</div>
      </div>

      <div className="aura-mt-12">
        <div className={`aura-pill-group ${disabled ? "aura-disabled" : ""}`} role="group" aria-label="Trading sessions">
          {([
            { key: "asia", label: "Asia" },
            { key: "london", label: "London" },
            { key: "ny", label: "New York" },
          ] as const).map((s) => {
            const on = !!current?.sessions[s.key];

            return (
              <button
                key={s.key}
                type="button"
                className="aura-pill-toggle"
                aria-pressed={on}
                disabled={disabled || !current}
                title={on ? "Enabled" : "Disabled"}
                onClick={async () => {
                  if (!current) return;
                  if (disabled) return;

                  await patchStrategySettings({
                    sessions: { [s.key]: !on } as any,
                  });
                }}
              >
                <span className="aura-pill-indicator" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Most traders start with one main session (e.g. New York) to keep results consistent.
        </p>
      </div>
    </section>
  );
}
