// src/app/app/strategy-setup/_components/TradingSessionsCard.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

const SESSION_DEFS = [
  { key: "asia", label: "Asia", hours: "00:00 – 07:59" },
  { key: "london", label: "London", hours: "08:00 – 12:59" },
  { key: "ny", label: "New York", hours: "13:00 – 21:59" },
] as const;

export function TradingSessionsCard({
  current,
  saving,
  disabled,
  patchStrategySettings,
}: Props) {
  if (!current) return null;

  const sessions = current.sessions;

  const allHours =
    sessions.asia && sessions.london && sessions.ny;

  const summary = saving
    ? "Saving…"
    : allHours
      ? "All hours (market open)"
      : (SESSION_DEFS
          .filter((s) => sessions[s.key])
          .map((s) => s.label)
          .join(", ") || "None selected");

  async function updateSessions(next: {
    asia: boolean;
    london: boolean;
    ny: boolean;
  }) {
    if (disabled) return;
    await patchStrategySettings({ sessions: next });
  }

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Trading Windows</div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            Choose when Aura is allowed to open new trades.
          </div>
        </div>

        <div className="aura-muted aura-text-xs">{summary}</div>
      </div>

      <div className="aura-mt-12">
        <div className={`aura-pill-group ${disabled ? "aura-disabled" : ""}`}>

          {/* All Hours */}
          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={allHours}
            disabled={disabled}
            onClick={() =>
              updateSessions({
                asia: true,
                london: true,
                ny: true,
              })
            }
          >
            <span className="aura-pill-indicator" />
            <span>All hours</span>
          </button>

          {/* Individual Sessions */}
          {SESSION_DEFS.map((s) => {
            const on = sessions[s.key];

            return (
              <button
                key={s.key}
                type="button"
                className="aura-pill-toggle"
                aria-pressed={on}
                disabled={disabled}
                onClick={() =>
                  updateSessions({
                    ...sessions,
                    [s.key]: !on,
                  })
                }
              >
                <span className="aura-pill-indicator" />
                <span>
                  {s.label}
                  <div className="aura-muted aura-text-xs">
                    {s.hours}
                  </div>
                </span>
              </button>
            );
          })}
        </div>

        <div className="aura-muted aura-text-xs aura-mt-10">
          Aura will only open new trades inside the selected windows.
          Existing trades can continue running outside these hours.
        </div>

        <div className="aura-muted aura-text-xs aura-mt-6">
          Times shown in UK time (Europe/London).
        </div>
      </div>
    </section>
  );
}
