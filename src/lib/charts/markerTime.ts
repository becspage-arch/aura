import type { Timeframe } from "@/lib/time/timeframes";
import { TF_SECONDS } from "@/lib/time/timeframes";

export function floorToTfTime(timeSec: number, tf: Timeframe): number {
  const s = TF_SECONDS[tf];
  return Math.floor(timeSec / s) * s;
}

// Canonical marker time is the 15s candle OPEN time
export function to15sBucket(timeSec: number): number {
  return floorToTfTime(timeSec, "15s");
}
