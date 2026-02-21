"use client";

import { getAblyRealtime } from "@/lib/ably/client";

export async function publishManualOrder(payload: {
  contractId: string;
  side: "buy" | "sell";
  size: number;
  stopLossTicks: number;
  takeProfitTicks: number;
}) {
  const client = getAblyRealtime();

  const me = String((client as any).auth?.clientId ?? "").trim();
  if (!me) {
    throw new Error("Ably clientId missing (not authenticated yet)");
  }

  const channelName = `aura:exec:${me}`;
  const ch = client.channels.get(channelName);

  // Worker supports multiple event names; we publish the canonical one.
  await ch.publish("exec", { type: "manualOrder", payload });
}
