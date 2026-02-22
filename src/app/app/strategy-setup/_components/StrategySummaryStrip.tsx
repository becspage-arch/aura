// src/app/app/strategy-setup/_components/StrategySummaryStrip.tsx
"use client";

import { useState } from "react";
import type { StrategySettings } from "../_lib/types";
import { fetchJSON } from "../_lib/api";

export function StrategySummaryStrip(props: {
  current: StrategySettings | null;
  loading: boolean;
  saving: boolean;
  isTrading: boolean; // locked when true
  onPaused?: (isPaused: boolean) => void;
}) {
  const [pausing, setPausing] = useState(false);
  const locked = props.isTrading;

  const rightStatus = props.loading
    ? "Loading…"
    : props.saving
      ? "Saving…"
      : locked
        ? "Locked (Aura running)"
        : "Saved";

  const symbolsText =
    props.current?.symbols?.length ? props.current.symbols.join(", ") : "None";

  const sessionsText = props.current
    ? ([
        props.current.sessions.asia ? "Asia" : null,
        props.current.sessions.london ? "London" : null,
        props.current.sessions.ny ? "New York" : null,
      ]
        .filter(Boolean)
        .join(", ") || "None")
    : "None";

  const riskText = props.current
    ? `$${props.current.riskUsd} risk • ${props.current.rr}RR`
    : "None";

  async function pauseAura() {
    try {
      setPausing(true);
      const res = await fetchJSON<{ ok: true; isPaused: boolean }>(
        "/api/trading-state/pause",
        {
          method: "POST",
          body: JSON.stringify({ isPaused: true }),
        }
      );
      props.onPaused?.(!!res.isPaused);
    } finally {
      setPausing(false);
    }
  }

  return (
    <section className="aura-card aura-health">
      <div className="aura-health-top">
        <div className="aura-card-title">Summary</div>
        <div className="aura-muted aura-text-xs">{rightStatus}</div>
      </div>

      {locked ? (
        <div className="aura-mt-10">
          <div className="aura-card-muted">
            <div className="aura-row-between">
              <div className="aura-muted aura-text-xs">
                Locked while Aura is running. Pause Aura to edit settings.
              </div>

              <button
                type="button"
                className={`aura-btn ${pausing ? "aura-disabled-btn" : ""}`}
                onClick={pauseAura}
                disabled={pausing}
                title="Pause Aura so you can edit settings"
              >
                {pausing ? "Pausing…" : "Pause Aura"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="aura-health-strip" aria-label="Strategy summary">
        <div className="aura-health-pill">
          <span className="aura-health-key">Symbol(s)</span>
          <span className="aura-health-val">{symbolsText}</span>
        </div>

        <div className="aura-health-pill">
          <span className="aura-health-key">Sessions</span>
          <span className="aura-health-val">{sessionsText}</span>
        </div>

        <div className="aura-health-pill">
          <span className="aura-health-key">Risk</span>
          <span className="aura-health-val">{riskText}</span>
        </div>

        {!locked ? (
          <div className="aura-health-pill">
            <span className="aura-health-key">State</span>
            <span className="aura-health-val">Editable</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
