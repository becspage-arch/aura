// src/lib/notifications/events.ts

export type TradeResult = "win" | "loss" | "breakeven";
export type TradeDirection = "long" | "short";

/**
 * Minimum viable trade-closed payload.
 * This should describe the outcome in a way the UI/push/email can use.
 */
export type TradeClosedEvent = {
  type: "trade_closed";
  ts: string; // ISO timestamp (when we detected the close)

  userId: string;

  tradeId: string; // Aura trade id (our DB id)
  accountId: string; // broker account id or our BrokerAccount id
  symbol: string;

  direction: TradeDirection;

  entryTs: string; // ISO
  exitTs: string; // ISO

  realisedPnlUsd: number; // + / -
  result: TradeResult;

  strategyRunId?: string; // optional
};

/**
 * Summary for a session/day (we’ll decide later how we define “session”).
 */
export type SessionSummaryEvent = {
  type: "session_summary";
  ts: string; // ISO timestamp (when summary was produced)

  userId: string;

  period: {
    kind: "session" | "daily";
    label: string; // e.g. "London", or "2026-02-06"
    startTs: string; // ISO
    endTs: string; // ISO
  };

  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;

  netPnlUsd: number;
  winRate: number; // 0..1
};

/**
 * Union of events our notification system will support (v1).
 */
export type NotificationEvent = TradeClosedEvent | SessionSummaryEvent;

/**
 * Idempotency key so we can safely retry without duplicates.
 */
export function notificationIdempotencyKey(e: NotificationEvent): string {
  if (e.type === "trade_closed") return `${e.tradeId}:${e.type}`;
  // session summary should be unique per user + period label + kind
  return `${e.userId}:${e.type}:${e.period.kind}:${e.period.label}`;
}
