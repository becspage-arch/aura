import type { Timeframe } from "@/lib/time/timeframes";

export type ChartMarkerKind =
  | "order_buy"
  | "order_sell"
  | "fill_buy_partial"
  | "fill_buy_full"
  | "fill_sell_partial"
  | "fill_sell_full"
  | "order_cancelled";

export type ChartMarker = {
  id: string;
  symbol: string;
  time: number; // epoch seconds candle OPEN time (15s canonical)
  tf: Timeframe; // stored as "15s" or "3m" for UI filtering
  kind: ChartMarkerKind;
  price?: number;
  label?: string;
  brokerAccountId?: string | null;
  orderId?: string | null;
  fillId?: string | null;
};
