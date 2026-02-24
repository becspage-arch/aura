// src/lib/ably/exec.ts
"use client";

import { getAblyRealtime } from "@/lib/ably/client";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForClientId(client: any, timeoutMs = 4000): Promise<string> {
  const start = Date.now();

  // If Ably hasn’t authenticated yet, try to authorize once.
  try {
    if (!String(client?.auth?.clientId ?? "").trim()) {
      await client.auth?.authorize?.();
    }
  } catch {
    // ignore – we’ll keep polling briefly
  }

  while (Date.now() - start < timeoutMs) {
    const me = String(client?.auth?.clientId ?? "").trim();
    if (me) return me;
    await sleep(100);
  }

  throw new Error("Ably clientId missing (still not authenticated)");
}

export async function publishManualOrder(params: {
  brokerName: string;
  brokerAccountId: string;

  contractId: string;
  side: "buy" | "sell";
  size: number;
  stopLossTicks: number;
  takeProfitTicks: number;
}) {
  const client: any = getAblyRealtime();

  const brokerName = String(params.brokerName || "").trim();
  const brokerAccountId = String(params.brokerAccountId || "").trim();
  if (!brokerName) throw new Error("brokerName required");
  if (!brokerAccountId) throw new Error("brokerAccountId required");

  // Wait for Ably auth to be ready instead of failing instantly.
  const me = await waitForClientId(client);

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
