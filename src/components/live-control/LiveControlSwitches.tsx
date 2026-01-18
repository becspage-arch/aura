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

  const setPause = async (next: boolean) => {
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

  const setKill = async (next: boolean) => {
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
      <div className="aura-muted aura-text-xs">
        {loading
          ? "Loading…"
          : state.killSwitchedAt
          ? `Kill switched at ${new Date(state.killSwitchedAt).toLocaleString()}`
          : ""}
      </div>

      {err ? (
        <div className="aura-mt-12 aura-error-block">
          <div className="aura-text-xs">Error</div>
          <div className="aura-text-xs">{err}</div>
        </div>
      ) : null}

      {/* Strategy-style controls (same layout as Strategy page) */}
      <div className="aura-mt-12 aura-grid-gap-12">
        {/* Pause / Running */}
        <div className={`aura-card-muted ${disabled ? "aura-disabled" : ""}`}>
          <div className="aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-group-title">
                {state.isPaused ? "Strategy is PAUSED" : "Strategy is RUNNING"}
              </div>
              <div className="aura-control-help">
                Prevents new trades. Data still runs.
              </div>
            </div>

            <div className="aura-control-right" style={{ minWidth: 260 }}>
              <div
                className="aura-pill-group"
                role="group"
                aria-label="Strategy pause control"
              >
                <button
                  type="button"
                  className="aura-pill-toggle"
                  aria-pressed={!state.isPaused}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    if (state.isPaused) setPause(false);
                  }}
                  title={!state.isPaused ? "Running" : "Set running"}
                >
                  <span className="aura-pill-indicator" />
                  <span>{saving === "pause" && !state.isPaused ? "Saving…" : "Running"}</span>
                </button>

                <button
                  type="button"
                  className="aura-pill-toggle"
                  aria-pressed={state.isPaused}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    if (!state.isPaused) setPause(true);
                  }}
                  title={state.isPaused ? "Paused" : "Set paused"}
                >
                  <span className="aura-pill-indicator" />
                  <span>{saving === "pause" && state.isPaused ? "Saving…" : "Paused"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Kill switch */}
        <div className={`aura-card-muted ${disabled ? "aura-disabled" : ""}`}>
          <div className="aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-group-title">{killLabel}</div>
              <div className="aura-control-help">
                Emergency stop for trading actions.
              </div>
            </div>

            <div className="aura-control-right" style={{ minWidth: 260 }}>
              <div
                className="aura-pill-group"
                role="group"
                aria-label="Kill switch control"
              >
                <button
                  type="button"
                  className="aura-pill-toggle"
                  aria-pressed={!state.isKillSwitched}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    if (state.isKillSwitched) setKill(false);
                  }}
                  title={!state.isKillSwitched ? "Kill switch OFF" : "Turn OFF"}
                >
                  <span className="aura-pill-indicator" />
                  <span>
                    {saving === "kill" && !state.isKillSwitched ? "Saving…" : "OFF"}
                  </span>
                </button>

                <button
                  type="button"
                  className="aura-pill-toggle"
                  aria-pressed={state.isKillSwitched}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    if (!state.isKillSwitched) setKill(true);
                  }}
                  title={state.isKillSwitched ? "Kill switch ON" : "Turn ON"}
                >
                  <span className="aura-pill-indicator" />
                  <span>
                    {saving === "kill" && state.isKillSwitched ? "Saving…" : "ON"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {state.isKillSwitched && state.killSwitchedAt ? (
            <p className="aura-muted aura-text-xs aura-mt-10">
              Activated {new Date(state.killSwitchedAt).toLocaleString()}.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
