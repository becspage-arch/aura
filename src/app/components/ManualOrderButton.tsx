"use client";

import { useState } from "react";

type ApiResp =
  | { ok: true; order: { contractId: string; side: "buy" | "sell"; size: number; stopLossTicks: number; takeProfitTicks: number } }
  | { ok: false; error: string };

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
        body: JSON.stringify({}),
      });

      const data = (await res.json().catch(() => null)) as ApiResp | null;

      if (!res.ok || !data) {
        setStatus("error");
        setMsg(`HTTP ${res.status}`);
        return;
      }

      if (!data.ok) {
        setStatus("error");
        setMsg(data.error || "Unknown error");
        return;
      }

      setStatus("sent");
      setMsg(
        `Sent: ${data.order.side.toUpperCase()} ${data.order.size} ${data.order.contractId} | SL ${data.order.stopLossTicks}t | TP ${data.order.takeProfitTicks}t`
      );
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

        <button className="aura-btn aura-btn-primary" onClick={onClick} disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Place test order"}
        </button>
      </div>

      {msg ? (
        <div className="aura-mt-12 aura-text-sm">
          <span className={status === "error" ? "aura-text-red" : "aura-muted"}>{msg}</span>
        </div>
      ) : null}
    </div>
  );
}
