export type AuraRealtimeEventType =
  | "order_submitted"
  | "order_filled"
  | "order_cancelled"
  | "position_opened"
  | "position_closed"
  | "error";

export type AuraBaseEvent<TType extends AuraRealtimeEventType, TData> = {
  type: TType;
  ts: string; // ISO timestamp
  data: TData;
};

// Keep payloads small and stable. You can add fields later.
export type OrderSubmittedData = {
  accountId: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  orderType: "market" | "limit" | "stop" | "stop_limit";
  price?: number;
};

export type OrderFilledData = {
  accountId: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  fillPrice: number;
  orderId?: string;
};

export type OrderCancelledData = {
  accountId: string;
  orderId: string;
  reason?: string;
};

export type PositionOpenedData = {
  accountId: string;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entryPrice: number;
};

export type PositionClosedData = {
  accountId: string;
  symbol: string;
  qty: number;
  exitPrice: number;
  pnl?: number;
  pnlCurrency?: "USD" | "GBP" | "EUR";
};

export type ErrorData = {
  accountId?: string;
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

export type AuraRealtimeEvent =
  | AuraBaseEvent<"order_submitted", OrderSubmittedData>
  | AuraBaseEvent<"order_filled", OrderFilledData>
  | AuraBaseEvent<"order_cancelled", OrderCancelledData>
  | AuraBaseEvent<"position_opened", PositionOpenedData>
  | AuraBaseEvent<"position_closed", PositionClosedData>
  | AuraBaseEvent<"error", ErrorData>;
