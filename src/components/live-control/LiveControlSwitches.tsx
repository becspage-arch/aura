// src/components/live-control/LiveControlSwitches.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type PauseGetResponse = {
  ok: true;
  isPaused: boolean;
  isKillSwitched: boolean;
  killSwitchedAt: string | null;
};

type PausePostResponse = {
  ok: true;
  isPaused: boolean;
};

type KillPostResponse = {
  ok: true;
  isKillSwitched: boolean;
  killSwitchedAt: string | null;
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  return (await res.json()) as T;
}

export function LiveControlSwitches() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<null | "pause" | "kill">(null);
  const [err, setErr] = useState<string | null>(null);

  const [state, setState] = useState<{
    isPaused: boolean;
    isKillSwitched: boolean;
    killSwitchedAt: string | null;
  }>({
    isPaused: false,
    isKillSwitched: false,
    killSwitchedAt: null,
  });

  const killLabel = useMemo(
    () => (state.isKillSwitched ? "Kill switch is ON" : "Kill switch is OFF"),
    [state.isKillSwitched]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetchJSON<PauseGetResponse>("/api/trading-state/pause");
        if (cancelled) return;

        setState({
          isPaused: Boolean(res.isPaused),
          isKillSwitched: Boolean(res.isKillSwitched),
          killSwitchedAt: res.killSwitchedAt ?? null,
        });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const togglePause = async () => {
    const next = !state.isPaused;

    const ok = window.confirm(
      next
        ? "Pause strategy? Aura will keep collecting data, but it will not place trades."
        : "Unpause strategy? Aura may start placing trades when signals occur."
    );
    if (!ok) return;

    try {
      setSaving("pause");
      setErr(null);

      const res = await fetchJSON<PausePostResponse>("/api/trading-state/pause", {
        method: "POST",
        body: JSON.stringify({ isPaused: next }),
      });

      setState((s) => ({ ...s, isPaused: res.isPaused }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const toggleKill = async () => {
    const next = !state.isKillSwitched;

    const ok = window.confirm(
      next
        ? "Turn ON the kill switch? This should immediately prevent any new trading actions."
        : "Turn OFF the kill switch? Aura may resume trading if your strategy is not paused."
    );
    if (!ok) return;

    try {
      setSaving("kill");
      setErr(null);

      const res = await fetchJSON<KillPostResponse>(
        "/api/trading-state/kill-switch",
        {
          method: "POST",
          body: JSON.stringify({ isKillSwitched: next }),
        }
      );

      setState((s) => ({
        ...s,
        isKillSwitched: res.isKillSwitched,
        killSwitchedAt: res.killSwitchedAt ?? null,
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const disabled = loading || saving !== null;

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Live Controls</div>
          <p className="aura-muted aura-text-xs aura-mt-10">
            Safety first. These controls affect live trading behaviour.
          </p>
        </div>

        {loading ? (
          <div className="aura-muted aura-text-xs">Loading…</div>
        ) : state.killSwitchedAt ? (
          <div className="aura-muted aura-text-xs">
            Kill switched at {new Date(state.killSwitchedAt).toLocaleString()}
          </div>
        ) : (
          <div className="aura-muted aura-text-xs" />
        )}
      </div>

      {err ? (
        <div className="aura-mt-12">
          <div className="aura-text-xs">Error</div>
          <div className="aura-text-xs">{err}</div>
        </div>
      ) : null}

      {/* Pills row */}
      <div className="aura-mt-12 aura-grid-2">
        {/* Pause pill */}
        <div className="aura-pill-card">
          <div className="aura-row-between">
            <div>
              <div className="aura-font-semibold">
                {state.isPaused ? "Strategy is PAUSED" : "Strategy is RUNNING"}
              </div>
              <div className="aura-muted aura-text-xs aura-mt-10">
                Prevents new trades. Data still runs.
              </div>
            </div>

            <button
              type="button"
              onClick={togglePause}
              disabled={disabled}
              className={`aura-btn aura-btn-pill ${disabled ? "aura-disabled-btn" : ""}`}
            >
              {saving === "pause"
                ? "Saving…"
                : state.isPaused
                ? "Unpause"
                : "Pause"}
            </button>
          </div>
        </div>

        {/* Kill pill */}
        <div className="aura-pill-card">
          <div className="aura-row-between">
            <div>
              <div className="aura-font-semibold">{killLabel}</div>
              <div className="aura-muted aura-text-xs aura-mt-10">
                Emergency stop for trading actions.
              </div>
            </div>

            <button
              type="button"
              onClick={toggleKill}
              disabled={disabled}
              className={`aura-btn aura-btn-pill ${disabled ? "aura-disabled-btn" : ""}`}
            >
              {saving === "kill"
                ? "Saving…"
                : state.isKillSwitched
                ? "Turn OFF"
                : "Turn ON"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
