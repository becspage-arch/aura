// src/lib/ably/exec.ts
"use client";

import { getAblyRealtime } from "@/lib/ably/client";

export async function publishManualOrder(params: {
  brokerName: string;
  brokerAccountId: string;

  contractId: string;
  side: "buy" | "sell";
  size: number;
  stopLossTicks: number;
  takeProfitTicks: number;
}) {
  const client = getAblyRealtime();

  const me = String((client as any).auth?.clientId ?? "").trim();
  if (!me) throw new Error("Ably clientId missing (not authenticated yet)");

  const brokerName = String(params.brokerName || "").trim();
  const brokerAccountId = String(params.brokerAccountId || "").trim();

  if (!brokerName) throw new Error("brokerName required");
  if (!brokerAccountId) throw new Error("brokerAccountId required");

  const channelName = `aura:exec:${me}:${brokerName}:${brokerAccountId}`;
  const ch = client.channels.get(channelName);

  await ch.publish("exec", {
    type: "manualOrder",
    payload: {
      contractId: params.contractId,
      side: params.side,
      size: params.size,
      stopLossTicks: params.stopLossTicks,
      takeProfitTicks: params.takeProfitTicks,
    },
  });
}
