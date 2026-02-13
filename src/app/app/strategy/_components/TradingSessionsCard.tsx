// src/app/app/strategy/_components/TradingSessionsCard.tsx
"use client";

import type { StrategyPostResponse, StrategySettings } from "../_lib/types";
import { fetchJSON } from "../_lib/api";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  setCurrent: (next: StrategySettings | null) => void;
  setSaving: (next: boolean) => void;
  setErr: (next: string | null) => void;
};

export function TradingSessionsCard({
  current,
  saving,
  disabled,
  setCurrent,
  setSaving,
  setErr,
}: Props) {
  const summary = saving
    ? "Saving…"
    : current
    ? [
        current.sessions.asia ? "Asia" : null,
        current.sessions.london ? "London" : null,
        current.sessions.ny ? "New York" : null,
      ]
        .filter(Boolean)
        .join(", ") || "None selected"
    : "—";

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Trading Sessions</div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            Select when Aura is allowed to trade.
          </div>
        </div>
        <div className="aura-muted aura-text-xs">{summary}</div>
      </div>

      <div className="aura-mt-12">
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
                onClick={async () => {
                  if (!current) return;

                  const prev = current;
                  const nextLocal: StrategySettings = {
                    ...current,
                    sessions: { ...current.sessions, [s.key]: !on },
                  };
                  setCurrent(nextLocal);

                  try {
                    setSaving(true);
                    setErr(null);

                    const res = await fetchJSON<StrategyPostResponse>(
                      "/api/trading-state/strategy-settings",
                      {
                        method: "POST",
                        body: JSON.stringify({
                          sessions: { [s.key]: !on },
                        }),
                      }
                    );

                    setCurrent(res.strategySettings);
                  } catch (e) {
                    setCurrent(prev);
                    setErr(e instanceof Error ? e.message : String(e));
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={disabled || !current}
                title={on ? "Enabled" : "Disabled"}
              >
                <span className="aura-pill-indicator" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Tip: most users start with one main session (e.g. New York) to keep results
          consistent.
        </p>
      </div>
    </section>
  );
}
