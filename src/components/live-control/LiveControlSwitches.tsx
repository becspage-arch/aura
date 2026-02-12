// src/components/live-control/LiveControlSwitches.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ManualOrderButton } from "@/app/components/ManualOrderButton";

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

  const disabled = loading || saving !== null;

  const setPause = async (nextPaused: boolean) => {
    const ok = window.confirm(
      nextPaused
        ? "Pause Aura?\n\nAura will keep monitoring the market, but it will not place new trades."
        : "Run Aura?\n\nAura will look for trades according to your strategy settings and start placing trades automatically when signals occur."
    );
    if (!ok) return;

    try {
      setSaving("pause");
      setErr(null);

      const res = await fetchJSON<PausePostResponse>("/api/trading-state/pause", {
        method: "POST",
        body: JSON.stringify({ isPaused: nextPaused }),
      });

      setState((s) => ({ ...s, isPaused: res.isPaused }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const setKill = async (nextKill: boolean) => {
    const ok = window.confirm(
      nextKill
        ? "Turn ON Emergency Stop?\n\nAura will be prevented from placing any new trades until you turn this off."
        : "Turn OFF Emergency Stop?\n\nAura can run again if it is not paused."
    );
    if (!ok) return;

    try {
      setSaving("kill");
      setErr(null);

      const res = await fetchJSON<KillPostResponse>("/api/trading-state/kill-switch", {
        method: "POST",
        body: JSON.stringify({ isKillSwitched: nextKill }),
      });

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

  const statusLine = useMemo(() => {
    if (loading) return "Loading status…";
    if (state.isKillSwitched) return "Emergency Stop is ON - Aura cannot place new trades.";
    if (state.isPaused) return "Aura is inactive - it will not place trades.";
    return "Aura is LIVE - it may place trades automatically.";
  }, [loading, state.isKillSwitched, state.isPaused]);

  return (
    <div className="aura-grid-gap-12">
      {/* Top helper line + error */}
      <section className="aura-card">
        <div className="aura-engine">
          <div className="aura-engine-top">
            <div>
              <div className="aura-card-title">Aura Engine</div>
              <div className="aura-engine-status aura-mt-10">
                <span
                  className={[
                    "aura-dot",
                    loading ? "aura-dot-paused" : state.isPaused ? "aura-dot-paused" : "aura-dot-live",
                  ].join(" ")}
                />
                <span>{statusLine}</span>
              </div>

              {state.isKillSwitched && state.killSwitchedAt ? (
                <div className="aura-muted aura-text-xs aura-mt-10">
                  Emergency Stop enabled {new Date(state.killSwitchedAt).toLocaleString()}.
                </div>
              ) : null}
            </div>

            <div className="aura-cta-row">
              {/* If kill switch ON, we keep Run/Pause disabled to make the system feel safe */}
              <button
                type="button"
                className={[
                  "aura-cta",
                  state.isPaused ? "aura-cta-primary" : "aura-cta-subtle",
                  disabled || state.isKillSwitched ? "aura-disabled-btn" : "",
                ].join(" ")}
                disabled={disabled || state.isKillSwitched}
                onClick={() => {
                  if (disabled || state.isKillSwitched) return;
                  setPause(!state.isPaused);
                }}
                title={state.isPaused ? "Run Aura" : "Pause Aura"}
              >
                {saving === "pause"
                  ? "Saving…"
                  : state.isPaused
                  ? "▶ RUN AURA"
                  : "❚❚ PAUSE AURA"}
              </button>
            </div>
          </div>

          {err ? (
            <div className="aura-mt-12 aura-error-block">
              <div className="aura-text-xs">Error</div>
              <div className="aura-text-xs">{err}</div>
            </div>
          ) : null}
        </div>
      </section>

      {/* DEV ONLY tools */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <div>
            <div className="aura-dev-badge">DEV ONLY</div>
            <div className="aura-mt-10 aura-muted aura-text-xs">
              Testing tools. Remove before customers.
            </div>
          </div>
        </div>

        <div className="aura-mt-12">
          <ManualOrderButton />
        </div>
      </section>

      {/* Emergency Control */}
      <section className={`aura-card aura-danger-card ${disabled ? "aura-disabled" : ""}`}>
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Emergency Control</div>
            <div className="aura-muted aura-text-xs aura-mt-10">
              Emergency Stop prevents Aura from placing any new trades. It does not close positions for you.
            </div>
            <div className="aura-muted aura-text-xs aura-mt-6">
              If you have an open trade, manage or close it in your broker as normal.
            </div>
          </div>

          <button
            type="button"
            className={[
              "aura-cta",
              "aura-cta-danger",
              disabled ? "aura-disabled-btn" : "",
            ].join(" ")}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setKill(!state.isKillSwitched);
            }}
            title={state.isKillSwitched ? "Turn OFF Emergency Stop" : "Turn ON Emergency Stop"}
          >
            {saving === "kill"
              ? "Saving…"
              : state.isKillSwitched
              ? "Emergency Stop: ON"
              : "Activate Emergency Stop"}
          </button>
        </div>

        <div className="aura-divider" />

        <div className="aura-muted aura-text-xs">
          {loading
            ? "Status loading…"
            : state.isKillSwitched
            ? "Aura is blocked from placing new trades until Emergency Stop is turned off."
            : "Emergency Stop is currently OFF."}
        </div>
      </section>
    </div>
  );
}
