// src/app/app/strategy/_components/TradingSessionsCard.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  setCurrent: (next: StrategySettings | null) => void;
  setSaving: (next: boolean) => void;
  setErr: (next: string | null) => void;
};

export function TradingSessionsCard({ current, saving }: Props) {
  const selected =
    current
      ? [
          current.sessions.asia ? "Asia" : null,
          current.sessions.london ? "London" : null,
          current.sessions.ny ? "NY" : null,
        ]
          .filter(Boolean)
          .join(", ") || "None"
      : "—";

  const isDisabled = true; // Coming soon (not wired yet)

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Trading Sessions</div>
          <div className="aura-muted aura-text-xs aura-mt-10">
            Choose when Aura is allowed to trade.
          </div>
        </div>

        <div className="aura-muted aura-text-xs">
          {saving ? "Saving…" : `Selected: ${selected}`}
        </div>
      </div>

      <div className="aura-mt-12 aura-callout aura-callout--warn">
        <div className="aura-callout-title">Coming soon</div>
        <div className="aura-callout-text">
          Session filtering isn’t active yet. Aura may trade outside these times.
        </div>
      </div>

      <div className={`aura-mt-12 ${isDisabled ? "aura-disabled" : ""}`}>
        <div className="aura-pill-group" role="group" aria-label="Trading sessions">
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
                disabled={true}
                title="Coming soon"
              >
                <span className="aura-pill-indicator" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          (This will be enabled once session logic is live.)
        </p>
      </div>
    </section>
  );
}
