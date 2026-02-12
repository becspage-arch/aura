// worker/src/notifications/emitNotifyEvent.ts

import type { AuraEventBase, AuraBroker } from "../events/auraEvents.js";

type LegacyNotifyEvent = {
  type: string; // e.g. "trade_closed"
  ts?: string;
  userId?: string; // clerk user id in your current usage
  [k: string]: any;
};

function isAuraEventBase(x: any): x is AuraEventBase {
  return (
    x &&
    typeof x === "object" &&
    typeof x.name === "string" &&
    typeof x.ts === "string" &&
    typeof x.broker === "string"
  );
}

function toAuraNameFromLegacyType(type: string): AuraEventBase["name"] {
  // map legacy "type" to new Aura event names
  // (add more as you introduce new types)
  if (type === "trade_closed") return "trade.closed";
  return "trade.closed"; // safe fallback for now
}

function inferBrokerFromLegacy(e: LegacyNotifyEvent): AuraBroker {
  // If you later pass broker explicitly, use it.
  const b = String((e as any).broker ?? "").toLowerCase();
  if (b === "projectx" || b === "rithmic" || b === "cqg") return b;
  return "unknown";
}

/**
 * Canonical emitter: sends AuraEventBase contract to the app ingest endpoint.
 * Backwards compatible: if you pass the legacy { type: "..."} event, it will be wrapped.
 */
export async function emitNotifyEvent(event: AuraEventBase | LegacyNotifyEvent) {
  const origin = (process.env.AURA_APP_ORIGIN || "").trim();
  const token = (process.env.NOTIFY_INGEST_TOKEN || "").trim();

  if (!origin) throw new Error("AURA_APP_ORIGIN missing (worker)");
  if (!token) throw new Error("NOTIFY_INGEST_TOKEN missing (worker)");

  const url = `${origin}/api/internal/notifications/ingest`;

  const payload: AuraEventBase = isAuraEventBase(event)
    ? event
    : {
        name: toAuraNameFromLegacyType(event.type),
        ts: (event.ts && String(event.ts)) || new Date().toISOString(),
        broker: inferBrokerFromLegacy(event),
        // legacy used clerkUserId in "userId"
        clerkUserId: event.userId ? String(event.userId) : undefined,
        data: { ...event },
      };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aura-token": token,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`notify ingest failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}
