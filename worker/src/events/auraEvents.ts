// worker/src/events/auraEvents.ts

export type AuraBroker = "projectx" | "rithmic" | "cqg" | "unknown";

export type AuraEventName =
  // market
  | "candle.15s.closed"
  | "candle.3m.closed"
  // execution lifecycle (engine/executor)
  | "exec.requested"
  | "exec.submitted"
  | "exec.brackets_attached"
  | "exec.failed"
  // broker lifecycle
  | "order.accepted"
  | "order.filled"
  | "position.open"
  | "position.closed"
  // notifications / app events
  | "trade.closed";

export type AuraEventBase = {
  name: AuraEventName;
  ts: string; // ISO
  broker: AuraBroker;
  userId?: string; // internal userProfile.id (optional if unknown at emit time)
  clerkUserId?: string; // optional convenience
  data?: Record<string, unknown>;
};

// Strongly-typed helpers (optional – keeps call sites consistent)
export function auraEvent(params: AuraEventBase): AuraEventBase {
  return params;
}
