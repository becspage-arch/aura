"use client";

import { useEffect, useState } from "react";

type Prefs = {
  tradeClosedWins: boolean;
  tradeClosedLosses: boolean;
  dailySummary: boolean;
  strategyStatus: boolean;
};

export function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings/notification-preferences", { method: "GET" });
    const data = await res.json();
    setPrefs(data.prefs);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };

    setPrefs(next);
    setSaving(key);

    try {
      await fetch("/api/settings/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
    } finally {
      setSaving(null);
    }
  }

  if (!prefs) {
    return <div className="aura-muted aura-text-xs">Loading preferences…</div>;
  }

  return (
    <div className="aura-mt-12 aura-pill-group">
      <button
        type="button"
        className={`aura-pill-toggle ${prefs.tradeClosedWins ? "is-on" : ""}`}
        aria-pressed={prefs.tradeClosedWins}
        onClick={() => toggle("tradeClosedWins")}
      >
        <span className="aura-pill-indicator" />
        <span className="aura-pill-toggle__stack">
          <span>Trade closed – wins</span>
          <span className="aura-pill-toggle__sublabel">
            Notify when a trade closes green.
            {saving === "tradeClosedWins" ? " Saving…" : ""}
          </span>
        </span>
      </button>

      <button
        type="button"
        className={`aura-pill-toggle ${prefs.tradeClosedLosses ? "is-on" : ""}`}
        aria-pressed={prefs.tradeClosedLosses}
        onClick={() => toggle("tradeClosedLosses")}
      >
        <span className="aura-pill-indicator" />
        <span className="aura-pill-toggle__stack">
          <span>Trade closed – losses</span>
          <span className="aura-pill-toggle__sublabel">
            Notify when a trade closes red.
            {saving === "tradeClosedLosses" ? " Saving…" : ""}
          </span>
        </span>
      </button>

      <button
        type="button"
        className={`aura-pill-toggle ${prefs.strategyStatus ? "is-on" : ""}`}
        aria-pressed={prefs.strategyStatus}
        onClick={() => toggle("strategyStatus")}
        >
        <span className="aura-pill-indicator" />
        <span className="aura-pill-toggle__stack">
            <span>Strategy status</span>
            <span className="aura-pill-toggle__sublabel">
            Notify when Aura is paused or running.
            {saving === "strategyStatus" ? " Saving…" : ""}
            </span>
        </span>
        </button>

      <button
        type="button"
        className={`aura-pill-toggle ${prefs.dailySummary ? "is-on" : ""}`}
        aria-pressed={prefs.dailySummary}
        onClick={() => toggle("dailySummary")}
      >
        <span className="aura-pill-indicator" />
        <span className="aura-pill-toggle__stack">
          <span>Daily summary</span>
          <span className="aura-pill-toggle__sublabel">
            End-of-day summary email.
            {saving === "dailySummary" ? " Saving…" : ""}
          </span>
        </span>
      </button>
    </div>
  );
}
