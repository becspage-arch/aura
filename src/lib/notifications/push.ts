// src/lib/notifications/push.ts
import type { TradeClosedEvent } from "./events";

export async function sendPushTradeClosed(_event: TradeClosedEvent) {
  // v1 stub: implement OneSignal later
  return { ok: true as const, provider: "stub" as const };
}
