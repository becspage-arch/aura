// src/components/NotificationPreferences.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Prefs = {
  tradeClosedWins: boolean;
  tradeClosedLosses: boolean;
  dailySummary: boolean;
  strategyStatus: boolean;
};

const DEFAULTS: Prefs = {
  tradeClosedWins: true,
  tradeClosedLosses: true,
  dailySummary: false,
  strategyStatus: true,
};

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<keyof Prefs | null>(null);
  const [msg, setMsg] = useState<string>("");

  const items = useMemo(
    () => [
      {
        key: "tradeClosedWins" as const,
        title: "Trade closed - wins",
        sub: "Only notify when a trade closes green.",
      },
      {
        key: "tradeClosedLosses" as const,
        title: "Trade closed - losses",
        sub: "Only notify when a trade closes red.",
      },
      {
        key: "strategyStatus" as const,
        title: "Strategy status",
        sub: "Aura is now running / paused.",
      },
      {
        key: "dailySummary" as const,
        title: "Daily summary",
        sub: "End-of-day summary email (later).",
        comingSoon: true, // we can keep this, but still let them toggle if you want
      },
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setMsg("");
      try {
        const res = await fetch("/api/settings/notification-preferences", { method: "GET" });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          if (!cancelled) setMsg(data?.error ?? `HTTP ${res.status}`);
          return;
        }

        const p = data?.prefs as Prefs | undefined;
        if (!cancelled && p) {
          setPrefs({
            tradeClosedWins: !!p.tradeClosedWins,
            tradeClosedLosses: !!p.tradeClosedLosses,
            dailySummary: !!p.dailySummary,
            strategyStatus: !!p.strategyStatus,
          });
          setLoaded(true);
        }
      } catch (e: any) {
        if (!cancelled) setMsg(e?.message ?? "Failed to load preferences");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!loaded) return;

    const nextVal = !prefs[key];

    // optimistic
    setPrefs((p) => ({ ...p, [key]: nextVal }));
    setSavingKey(key);
    setMsg("");

    try {
      const res = await fetch("/api/settings/notification-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: nextVal }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // rollback
        setPrefs((p) => ({ ...p, [key]: !nextVal }));
        setMsg(data?.error ?? `HTTP ${res.status}`);
        return;
      }

      const p = data?.prefs as Prefs | undefined;
      if (p) {
        setPrefs({
          tradeClosedWins: !!p.tradeClosedWins,
          tradeClosedLosses: !!p.tradeClosedLosses,
          dailySummary: !!p.dailySummary,
          strategyStatus: !!p.strategyStatus,
        });
      }
    } catch (e: any) {
      // rollback
      setPrefs((p) => ({ ...p, [key]: !nextVal }));
      setMsg(e?.message ?? "Failed to save");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div>
      <div className="aura-control-title">What to notify you about</div>
      <div className="aura-control-help">
        Choose which events you want alerts for.
      </div>

      <div className="aura-mt-12 aura-pill-group">
        {items.map((it) => {
          const pressed = !!prefs[it.key];
          const busy = savingKey === it.key;

          // If you want daily summary truly disabled in UI:
          const disabled = !loaded || busy || !!it.comingSoon;

          return (
            <button
              key={it.key}
              type="button"
              className={`aura-pill-toggle ${disabled ? "aura-disabled" : ""}`}
              aria-pressed={pressed}
              onClick={() => (!disabled ? toggle(it.key) : null)}
              title={it.comingSoon ? "Coming soon" : ""}
            >
              <span className="aura-pill-indicator" />
              <span className="aura-pill-toggle__stack">
                <span>
                  {it.title}
                  {busy ? " - saving..." : it.comingSoon ? " - soon" : ""}
                </span>
                <span className="aura-pill-toggle__sublabel">{it.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="aura-muted aura-text-xs aura-mt-10" style={{ minHeight: 16 }}>
        {msg ? `❌ ${msg}` : ""}
      </div>
    </div>
  );
}
