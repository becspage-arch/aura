import type { Time } from "lightweight-charts";

export type Candle = {
  time: number; // epoch seconds (UTC), candle OPEN time
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type SeriesCandle = {
  time: Time; // lightweight-charts Time type (we’ll pass epoch seconds)
  open: number;
  high: number;
  low: number;
  close: number;
};
