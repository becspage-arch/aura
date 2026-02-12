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

function formatSavedSessions(current: StrategySettings | null) {
  if (!current) return "—";
  const list = [
    current.sessions.asia ? "Asia" : null,
    current.sessions.london ? "London" : null,
    current.sessions.ny ? "New York" : null,
  ].filter(Boolean) as string[];

  return list.length ? `Saved: ${list.join(", ")}` : "Saved: None";
}

export function TradingSessionsCard({
  current,
  saving,
  disabled,
  setCurrent,
  setSaving,
  setErr,
}: Props) {
  // props are kept to avoid changing the page contract right now
  void saving;
  void disabled;
  void setCurrent;
  void setSaving;
  void setErr;

  const savedLabel = formatSavedSessions(current);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Trading Sessions</div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            Choose the sessions you want Aura to trade in.
            <span className="aura-muted"> (Coming soon)</span>
          </div>
        </div>

        <div className="aura-muted aura-text-xs">{savedLabel}</div>
      </div>

      <div className="aura-mt-12">
        <div className="aura-pill-group aura-disabled" role="group" aria-label="Trading sessions (coming soon)">
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
                onClick={() => {}}
                disabled={true}
                title="Coming soon – session filtering isn’t enforced yet."
              >
                <span className="aura-pill-indicator" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="aura-mt-10 aura-error-block">
          <div className="aura-text-xs">Coming soon</div>
          <div className="aura-text-xs">
            Session filtering is not enforced by the worker yet. These choices are
            shown early so you can see what’s planned.
          </div>
        </div>
      </div>
    </section>
  );
}
