export type Timeframe = "15s" | "3m";

export const TF_SECONDS: Record<Timeframe, number> = {
  "15s": 15,
  "3m": 180,
};

export function floorToTf(epochSec: number, tf: Timeframe): number {
  const s = TF_SECONDS[tf];
  return Math.floor(epochSec / s) * s;
}
