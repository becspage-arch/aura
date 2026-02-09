"use client";

import { useState } from "react";

export function ManualOrderButton() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  async function onClick() {
    try {
      setStatus("sending");
      setMsg("");

      const res = await fetch("/api/dev/manual-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const text = await res.text();

      if (!res.ok) {
        setStatus("error");
        setMsg(text || `HTTP ${res.status}`);
        return;
      }

      setStatus("sent");
      setMsg("Sent. Check TopstepX + worker logs.");
    } catch (e) {
      setStatus("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Manual Test Order</div>
          <div className="aura-muted aura-text-xs">
            Temporary button. Sends a market order with default SL/TP.
          </div>
        </div>

        <button
          className="aura-btn aura-btn-primary"
          onClick={onClick}
          disabled={status === "sending"}
        >
          {status === "sending" ? "Sending…" : "Place test order"}
        </button>
      </div>

      {msg ? (
        <div className="aura-mt-12 aura-text-sm">
          <span className={status === "error" ? "aura-text-red" : "aura-muted"}>
            {msg}
          </span>
        </div>
      ) : null}
    </div>
  );
}
