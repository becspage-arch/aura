import type { Candle } from "@/lib/charts/types";

export function mergeClosedCandle(existing: Candle[], incoming: Candle): Candle[] {
  if (!existing.length) return [incoming];

  const last = existing[existing.length - 1];

  if (incoming.time > last.time) {
    return [...existing, incoming];
  }

  if (incoming.time === last.time) {
    const next = existing.slice(0, -1);
    next.push(incoming);
    return next;
  }

  // Older candle: ignore (out-of-order delivery protection)
  return existing;
}
