// src/app/app/strategy-setup/_components/StrategyRunStateBanner.tsx
"use client";

import { useState } from "react";
import { fetchJSON } from "../_lib/api";

export function StrategyRunStateBanner(props: {
  loading: boolean;
  isTrading: boolean; // locked when true
  isPaused: boolean;
  isKillSwitched: boolean;
  onRuntimeRefresh?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  // If kill-switched, treat as "not running" (editable),
  // but show a clear status.
  if (props.loading) return null;

  const locked = props.isTrading === true;
  const paused = props.isPaused === true;
  const kill = props.isKillSwitched === true;

  const variantClass = locked
    ? "aura-runBanner--locked"
    : "aura-runBanner--paused";

  const title = locked
    ? "Settings Locked While Aura Is Running"
    : kill
      ? "Aura Stopped (Kill Switch On)"
      : "Aura Currently Paused";

  const sub = locked
    ? "Please pause Aura to make changes to your strategy settings."
    : kill
      ? "Disable the kill switch to run Aura again."
      : "Update your settings, then click Run when you are ready.";

  async function setPaused(nextPaused: boolean) {
    try {
      setBusy(true);
      await fetchJSON<{ ok: true; isPaused: boolean }>("/api/trading-state/pause", {
        method: "POST",
        body: JSON.stringify({ isPaused: nextPaused }),
      });
      props.onRuntimeRefresh?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`aura-runBanner ${variantClass}`}>
      <div className="aura-runBanner__left">
        <div className="aura-runBanner__title">{title}</div>
        <div className="aura-runBanner__sub">{sub}</div>
      </div>

      <div className="aura-runBanner__actions">
        {locked ? (
          <button
            type="button"
            className={`aura-cta aura-cta-primary ${busy ? "aura-disabled-btn" : ""}`}
            onClick={() => setPaused(true)}
            disabled={busy}
            title="Pause Aura to unlock settings"
          >
            <span className="aura-runBanner__icon" aria-hidden="true">
              ⏸
            </span>
            <span>{busy ? "Pausing…" : "Pause Aura"}</span>
          </button>
        ) : (
          <button
            type="button"
            className={`aura-cta aura-cta-primary ${busy || kill ? "aura-disabled-btn" : ""}`}
            onClick={() => setPaused(false)}
            disabled={busy || kill}
            title={kill ? "Kill switch is enabled" : "Run Aura"}
          >
            <span className="aura-runBanner__icon" aria-hidden="true">
              ▶
            </span>
            <span>{busy ? "Starting…" : "Run Aura"}</span>
          </button>
        )}
      </div>
    </section>
  );
}
