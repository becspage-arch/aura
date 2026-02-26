// src/app/app/strategy-setup/_components/StrategySummaryStrip.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

export function StrategySummaryStrip(props: {
  current: StrategySettings | null;
  loading: boolean;
  saving: boolean;
  isTrading: boolean;
  enabledAccountsCount?: number;
}) {
  const locked = props.isTrading;

  const rightStatus = props.loading
    ? "Loading…"
    : props.saving
      ? "Saving…"
      : locked
        ? "Locked"
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

  return (
    <section className="aura-card aura-health">
      <div className="aura-health-top">
        <div className="aura-card-title">Summary</div>
        <div className="aura-muted aura-text-xs">{rightStatus}</div>
      </div>

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

        <div className="aura-health-pill">
          <span className="aura-health-key">Accounts</span>
          <span className="aura-health-val">
            {props.enabledAccountsCount ?? 0} enabled
          </span>
        </div>

        <div className="aura-health-pill">
          <span className="aura-health-key">State</span>
          <span className="aura-health-val">
            {locked ? "Locked (Aura running)" : "Editable"}
          </span>
        </div>
      </div>
    </section>
  );
}
