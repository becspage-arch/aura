// src/lib/notifications/events.ts

export type TradeResult = "win" | "loss" | "breakeven";
export type TradeDirection = "long" | "short";

/**
 * Minimum viable trade-closed payload.
 */
export type TradeClosedEvent = {
  type: "trade_closed";
  ts: string; // ISO timestamp (when we detected the close)

  userId: string;

  tradeId: string;
  accountId: string;
  symbol: string;

  direction: TradeDirection;

  entryTs: string;
  exitTs: string;

  realisedPnlUsd: number;
  result: TradeResult;

  strategyRunId?: string;
};

export type TradeOpenedEvent = {
  type: "trade_opened";
  ts: string;

  userId: string;

  tradeId: string;
  accountId: string;
  symbol: string;

  direction: TradeDirection;
  size: number;

  entryTs: string;
  entryPrice?: number;

  strategyRunId?: string;
};

/**
 * Strategy status change (pause/run)
 */
export type StrategyStatusChangedEvent = {
  type: "strategy_status_changed";
  ts: string; // ISO timestamp
  userId: string; // Clerk user id
  isPaused: boolean;
};

export type SessionSummaryEvent = {
  type: "session_summary";
  ts: string;

  userId: string;

  period: {
    kind: "session" | "daily";
    label: string;
    startTs: string;
    endTs: string;
  };

  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;

  netPnlUsd: number;
  winRate: number;
};

export type NotificationEvent =
  | TradeClosedEvent
  | TradeOpenedEvent
  | StrategyStatusChangedEvent
  | SessionSummaryEvent;

export function notificationIdempotencyKey(e: NotificationEvent): string {
  if (e.type === "trade_closed") return `${e.tradeId}:${e.type}`;
  if (e.type === "trade_opened") return `${e.tradeId}:${e.type}`;
  if (e.type === "strategy_status_changed") return `${e.userId}:${e.type}:${e.ts}`;
  return `${e.userId}:${e.type}:${e.period.kind}:${e.period.label}`;
}
