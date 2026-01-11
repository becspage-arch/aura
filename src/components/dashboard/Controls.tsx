"use client";

import { useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardStore";

export default function Controls() {
  const { state, dispatch } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function setPause(isPaused: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/trading-state/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaused }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "Failed to update pause");
      dispatch({ type: "SET_TRADING_STATE", payload: { isPaused: data.isPaused } });
      setMsg("✅ Updated");
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : "Error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function setKill(isKillSwitched: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/trading-state/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isKillSwitched }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "Failed to update kill switch");
      dispatch({
        type: "SET_TRADING_STATE",
        payload: { isKillSwitched: data.isKillSwitched, killSwitchedAt: data.killSwitchedAt },
      });
      setMsg("✅ Updated");
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : "Error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Controls</h2>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setPause(!state.tradingState.isPaused)}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}
        >
          {state.tradingState.isPaused ? "Resume trading" : "Pause trading"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => setKill(!state.tradingState.isKillSwitched)}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}
        >
          {state.tradingState.isKillSwitched ? "Disable Kill Switch" : "Enable Kill Switch"}
        </button>

        {msg ? <span style={{ fontSize: 12, opacity: 0.9 }}>{msg}</span> : null}
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        Paused: {String(state.tradingState.isPaused)} | Kill Switch: {String(state.tradingState.isKillSwitched)}
      </div>
    </section>
  );
}
