"use client";

import { useState } from "react";
import { publishManualOrder } from "@/lib/ably/exec";

export function ManualOrderButton() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  async function onClick() {
    try {
      setStatus("sending");
      setMsg("");

      // Keep deterministic defaults (same as the dev route used)
      const order = {
        contractId: "CON.F.US.MGC.J26",
        side: "buy" as const,
        size: 1,
        stopLossTicks: 45,
        takeProfitTicks: 45,
      };

      await publishManualOrder(order);

      setStatus("sent");
      setMsg(
        `Sent: ${order.side.toUpperCase()} ${order.size} ${order.contractId} | SL ${order.stopLossTicks}t | TP ${order.takeProfitTicks}t`
      );
    } catch (e) {
      setStatus("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="aura-grid-gap-12">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Manual Test Order</div>
          <div className="aura-muted aura-text-xs">
            Publishes a manual order to your per-user exec channel (token-scoped).
          </div>
        </div>

        <button
          className="aura-cta aura-cta-primary"
          onClick={onClick}
          disabled={status === "sending"}
        >
          {status === "sending" ? "Sending…" : "Place test order"}
        </button>
      </div>

      {msg ? (
        <div className="aura-text-sm">
          <span className={status === "error" ? "aura-text-red" : "aura-muted"}>{msg}</span>
        </div>
      ) : null}
    </div>
  );
}
