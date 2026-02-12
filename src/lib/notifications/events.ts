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

export type TradeOpenedEvent = {
  type: "trade_opened";
  ts: string; // ISO timestamp (when we placed / confirmed the entry)

  userId: string;

  tradeId: string;
  accountId: string;
  symbol: string;

  direction: TradeDirection;
  size: number;

  entryTs: string; // ISO
  entryPrice?: number; // optional (depends on what we have at entry time)

  strategyRunId?: string; // optional
};

/**
 * Strategy status changed (pause/run).
 * We’ll send this when the user toggles pause.
 */
export type StrategyStatusChangedEvent = {
  type: "strategy_status_changed";
  ts: string; // ISO timestamp of the state write (use DB updatedAt if possible)

  userId: string;

  isPaused: boolean;
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
export type NotificationEvent =
  | TradeClosedEvent
  | TradeOpenedEvent
  | StrategyStatusChangedEvent
  | SessionSummaryEvent;

/**
 * Idempotency key so we can safely retry without duplicates.
 */
export function notificationIdempotencyKey(e: NotificationEvent): string {
  if (e.type === "trade_closed") return `${e.tradeId}:${e.type}`;
  if (e.type === "trade_opened") return `${e.tradeId}:${e.type}`;

  // strategy status should be unique per user + state + timestamp of the write
  if (e.type === "strategy_status_changed") {
    return `${e.userId}:${e.type}:${e.isPaused}:${e.ts}`;
  }

  // session summary should be unique per user + period label + kind
  return `${e.userId}:${e.type}:${e.period.kind}:${e.period.label}`;
}

