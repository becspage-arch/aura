// worker/src/candles/candle15sAggregator.ts

type QuoteTick = {
  contractId: string;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  ts?: string | null; // broker timestamp (optional)
};

export type Candle15s = {
  contractId: string;
  // bucket start epoch ms (15s aligned)
  t0: number;
  o: number;
  h: number;
  l: number;
  c: number;
  // counts are handy for debugging trust
  ticks: number;
};

export type CandleClosedEvent = {
  name: "candle.15s.closed";
  ts: string; // ISO time when we closed it (worker time)
  data: Candle15s;
};

function floorTo15sBucketStartMs(epochMs: number): number {
  const bucketMs = 15_000;
  return Math.floor(epochMs / bucketMs) * bucketMs;
}

function pickPrice(t: QuoteTick): number | null {
  // Prefer last, else mid, else bid, else ask
  const last = typeof t.last === "number" ? t.last : null;
  if (last !== null) return last;

  const bid = typeof t.bid === "number" ? t.bid : null;
  const ask = typeof t.ask === "number" ? t.ask : null;
  if (bid !== null && ask !== null) return (bid + ask) / 2;

  if (bid !== null) return bid;
  if (ask !== null) return ask;

  return null;
}

export class Candle15sAggregator {
  private current: Candle15s | null = null;

  // Returns a closed candle event when rollover happens, otherwise null.
  ingest(tick: QuoteTick, arrivalEpochMs: number = Date.now()): CandleClosedEvent | null {
    const price = pickPrice(tick);
    if (price === null) return null;

    const bucketStart = floorTo15sBucketStartMs(arrivalEpochMs);

    // First tick ever -> open first candle
    if (!this.current) {
      this.current = {
        contractId: tick.contractId,
        t0: bucketStart,
        o: price,
        h: price,
        l: price,
        c: price,
        ticks: 1,
      };

      console.log("[candle15s] open", {
        contractId: this.current.contractId,
        t0: this.current.t0,
        o: this.current.o,
      });

      return null;
    }

    // Rollover: new bucket
    if (bucketStart !== this.current.t0) {
      const closed = this.current;

      console.log("[candle15s] close", {
        contractId: closed.contractId,
        t0: closed.t0,
        o: closed.o,
        h: closed.h,
        l: closed.l,
        c: closed.c,
        ticks: closed.ticks,
      });

      // Start the next candle with this tick as the first tick
      this.current = {
        contractId: tick.contractId,
        t0: bucketStart,
        o: price,
        h: price,
        l: price,
        c: price,
        ticks: 1,
      };

      console.log("[candle15s] open", {
        contractId: this.current.contractId,
        t0: this.current.t0,
        o: this.current.o,
      });

      return {
        name: "candle.15s.closed",
        ts: new Date().toISOString(),
        data: closed,
      };
    }

    // Same bucket: update OHLC
    this.current.h = Math.max(this.current.h, price);
    this.current.l = Math.min(this.current.l, price);
    this.current.c = price;
    this.current.ticks += 1;

    return null;
  }
}
