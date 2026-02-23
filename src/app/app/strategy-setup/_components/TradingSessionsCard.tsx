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

type SessionKey = (typeof SESSION_DEFS)[number]["key"];

export function TradingSessionsCard({ current, saving, disabled, patchStrategySettings }: Props) {
  if (!current) return null;

  const sessions = current.sessions;

  const noneSelected = !sessions.asia && !sessions.london && !sessions.ny;
  const allHours = noneSelected; // ✅ single source of truth

  const summary = saving
    ? "Saving…"
    : allHours
      ? "All hours (market open)"
      : (SESSION_DEFS.filter((s) => sessions[s.key]).map((s) => s.label).join(", ") || "All hours");

  async function updateSessions(next: { asia: boolean; london: boolean; ny: boolean }) {
    if (disabled) return;
    await patchStrategySettings({ sessions: next });
  }

  function toggleSession(key: SessionKey) {
    // If we’re in All-hours mode (none selected), start from all false, then turn THIS one on.
    if (noneSelected) {
      void updateSessions({
        asia: key === "asia",
        london: key === "london",
        ny: key === "ny",
      });
      return;
    }

    // Normal toggle
    void updateSessions({
      ...sessions,
      [key]: !sessions[key],
    });
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
        <div className={`aura-pill-group ${disabled ? "aura-disabled" : ""}`} role="group" aria-label="Trading windows">
          {/* All Hours (clears selection) */}
          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={allHours}
            disabled={disabled}
            onClick={() => updateSessions({ asia: false, london: false, ny: false })}
            title="Trade any time the market is open"
          >
            <span className="aura-pill-indicator" />
            <span>
              All hours
              <div className="aura-muted aura-text-xs">Market open</div>
            </span>
          </button>

          {/* Individual Sessions */}
          {SESSION_DEFS.map((s) => {
            const on = sessions[s.key];

            return (
              <button
                key={s.key}
                type="button"
                className="aura-pill-toggle"
                aria-pressed={on && !allHours}
                disabled={disabled}
                onClick={() => toggleSession(s.key)}
                title={on ? "Enabled" : "Disabled"}
              >
                <span className="aura-pill-indicator" />
                <span>
                  {s.label}
                  <div className="aura-muted aura-text-xs">{s.hours}</div>
                </span>
              </button>
            );
          })}
        </div>

        <div className="aura-muted aura-text-xs aura-mt-10">
          Aura will only open new trades inside the selected windows. Existing trades can continue running outside these hours.
        </div>

        <div className="aura-muted aura-text-xs aura-mt-6">
          Times shown in UK time (Europe/London).
        </div>
      </div>
    </section>
  );
}
