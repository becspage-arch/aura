// worker/src/strategy/coreplus315Engine.ts

import {
  buildCorePlus315Config,
  contractsForRisk,
  priceToTicks,
  tpTicks,
  resolveCorePlus315ConfigFromUser,
  type CorePlus315Config,
} from "./coreplus315Config.js";

export type Candle15s = {
  symbol: string; // contractId string for now, later can be a user-selected symbol key
  time: number; // epoch seconds, OPEN time
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type Candle3m = {
  symbol: string;
  time: number; // epoch seconds, OPEN time (aligned to 180s)
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Side = "buy" | "sell";

export type TradeIntent = {
  strategy: "coreplus315";
  symbol: string;
  side: Side;

  // Times
  entryTime: number; // epoch seconds of the 15s candle close that confirmed entry
  fvgTime: number; // epoch seconds of the 3m candle open that created the FVG

  // Prices
  entryPrice: number;
  stopPrice: number;
  takeProfitPrice: number;

  // Risk math
  stopTicks: number;
  tpTicks: number;
  rr: number;
  contracts: number;
  riskUsdPlanned: number; // contracts * stopTicks * tickValue (<= cfg.riskUsd)

  // For debugging / UI later
  meta: {
    fvgTop: number;
    fvgBottom: number;
    retested: boolean;
  };
};

type FvgBox = {
  side: Side; // buy = bullish FVG, sell = bearish FVG
  time: number; // 3m candle open time that produced the FVG
  top: number;
  bottom: number;

  // lifecycle flags
  invalid: boolean;
  retested: boolean;
  traded: boolean;
};

function floorTo3m(t: number): number {
  return Math.floor(t / 180) * 180;
}

function isNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export class CorePlus315Engine {
  private cfg: CorePlus315Config;

  // rolling windows
  private last15s: Candle15s[] = []; // keep small window; we only need last 3 + scan for retest
  private pending3m: {
    bucketStart: number;
    open: number;
    high: number;
    low: number;
    close: number;
    count: number; // number of 15s candles in the bucket
  } | null = null;

  // 3m series for FVG detection (need last 3 closed 3m candles)
  private last3m: Candle3m[] = [];

  // active FVG (we follow “latest box” semantics like your indicator)
  private activeFvg: FvgBox | null = null;

  constructor(params: {
    tickSize: number;
    tickValue: number;
    userSettings?: { riskUsd?: number | null } | null;
  }) {
    this.cfg = resolveCorePlus315ConfigFromUser({
      tickSize: params.tickSize,
      tickValue: params.tickValue,
      userSettings: params.userSettings ?? null,
    });
  }

  /**
   * Later: swap this with DB-loaded per-user config.
   */
  setConfig(
    overrides: Partial<Omit<CorePlus315Config, "tickSize" | "tickValue">>
  ) {
    this.cfg = buildCorePlus315Config({
      tickSize: this.cfg.tickSize,
      tickValue: this.cfg.tickValue,
      overrides,
    });
  }

  getConfig(): CorePlus315Config {
    return this.cfg;
  }

  getDebugState() {
    return {
      hasActiveFvg: Boolean(this.activeFvg),
      fvg: this.activeFvg
        ? {
            side: this.activeFvg.side,
            time: this.activeFvg.time,
            top: this.activeFvg.top,
            bottom: this.activeFvg.bottom,
            invalid: this.activeFvg.invalid,
            retested: this.activeFvg.retested,
            traded: this.activeFvg.traded,
          }
        : null,
      last15sCount: this.last15s.length,
      last3mCount: this.last3m.length,
    };
  }

  /**
   * Mark the currently-active FVG as "traded" *only after* a successful submission.
   * This prevents "traded=true" when the broker rejects the order.
   *
   * Guard:
   * - We only mark if the active FVG matches the intent's fvgTime.
   */
  markActiveFvgTraded(params: { fvgTime: number }): boolean {
    if (!this.activeFvg) return false;
    if (this.activeFvg.invalid) return false;
    if (this.activeFvg.time !== params.fvgTime) return false;

    this.activeFvg.traded = true;
    return true;
  }

  /**
   * Main entry point: call this for each CLOSED 15s candle.
   * Returns a TradeIntent when the entry triggers; otherwise null.
   *
   * IMPORTANT:
   * This function does NOT set activeFvg.traded anymore.
   * The caller must call markActiveFvgTraded() after successful execution.
   */
  ingestClosed15s(c: Candle15s): TradeIntent | null {
    // store 15s
    this.last15s.push(c);
    if (this.last15s.length > 600) this.last15s.shift(); // plenty for retest scanning

    // build/close 3m
    const maybe3m = this.ingest15sInto3m(c);
    if (maybe3m) {
      this.onClosed3m(maybe3m);
    }

    // no FVG = no entries
    if (!this.activeFvg || this.activeFvg.invalid || this.activeFvg.traded) {
      return null;
    }

    // retest detection (any 15s candle that overlaps the FVG zone)
    if (!this.activeFvg.retested) {
      const overlaps =
        c.low <= this.activeFvg.top && c.high >= this.activeFvg.bottom;
      if (overlaps) {
        this.activeFvg.retested = true;
      }
    }

    // We require retest before entries (core to 315)
    if (!this.activeFvg.retested) return null;

    // Need last 3 closed 15s candles to detect expansion
    if (this.last15s.length < 3) return null;
    const a = this.last15s[this.last15s.length - 3];
    const b = this.last15s[this.last15s.length - 2]; // “second candle”
    const d = this.last15s[this.last15s.length - 1]; // confirmation candle close == entry trigger

    // 3-candle expansion patterns (same as your Pine)
    const bull15 = d.low > a.high;
    const bear15 = d.high < a.low;

    const side: Side = this.activeFvg.side;

    // Direction must match active FVG
    if (side === "buy" && !bull15) return null;
    if (side === "sell" && !bear15) return null;

    // Entry: market at close of confirmation candle
    const entryPrice = d.close;

    // Stop: "very bottom of the second candle" / "very top" (wick if present, else body)
    // Practically: buys -> b.low, sells -> b.high
    const stopPrice = side === "buy" ? b.low : b.high;

    // Risk checks
    const stopDist =
      side === "buy" ? entryPrice - stopPrice : stopPrice - entryPrice;
    if (!isNumber(stopDist) || stopDist <= 0) return null;

    const stopTicks = priceToTicks(stopDist, this.cfg.tickSize);
    if (!isNumber(stopTicks) || stopTicks <= 0) return null;

    // Enforce max stop ticks (only filter ON right now)
    if (stopTicks > this.cfg.maxStopTicks) return null;

    const contracts = contractsForRisk({
      riskUsd: this.cfg.riskUsd,
      stopTicks,
      tickValue: this.cfg.tickValue,
    });

    if (contracts <= 0) return null;

    const tpT = tpTicks(stopTicks, this.cfg.rr);
    const tpDist = tpT * this.cfg.tickSize;

    const takeProfitPrice =
      side === "buy" ? entryPrice + tpDist : entryPrice - tpDist;

    const plannedRisk = contracts * stopTicks * this.cfg.tickValue;

    const intent: TradeIntent = {
      strategy: "coreplus315",
      symbol: c.symbol,
      side,
      entryTime: d.time + 15, // candle close time (open + 15s)
      fvgTime: this.activeFvg.time,
      entryPrice,
      stopPrice,
      takeProfitPrice,
      stopTicks,
      tpTicks: tpT,
      rr: this.cfg.rr,
      contracts,
      riskUsdPlanned: plannedRisk,
      meta: {
        fvgTop: this.activeFvg.top,
        fvgBottom: this.activeFvg.bottom,
        retested: this.activeFvg.retested,
      },
    };

    return intent;
  }

  /**
   * Build 3m candles from closed 15s candles.
   * A 3m candle closes after 12 x 15s candles.
   */
  private ingest15sInto3m(c: Candle15s): Candle3m | null {
    const bucketStart = floorTo3m(c.time);

    if (!this.pending3m || this.pending3m.bucketStart !== bucketStart) {
      // If we had a partially built bucket and it didn't finish, we drop it.
      // (This can happen on gaps/weekend; OK for now.)
      this.pending3m = {
        bucketStart,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        count: 1,
      };
      return null;
    }

    // update current bucket
    this.pending3m.high = Math.max(this.pending3m.high, c.high);
    this.pending3m.low = Math.min(this.pending3m.low, c.low);
    this.pending3m.close = c.close;
    this.pending3m.count += 1;

    // 12 x 15s = 3 minutes
    if (this.pending3m.count >= 12) {
      const out: Candle3m = {
        symbol: c.symbol,
        time: this.pending3m.bucketStart,
        open: this.pending3m.open,
        high: this.pending3m.high,
        low: this.pending3m.low,
        close: this.pending3m.close,
      };
      this.pending3m = null;
      return out;
    }

    return null;
  }

  /**
   * Detect new 3m FVG and invalidation (mirrors your indicator defaults: onlyWhen50=false etc).
   */
  private onClosed3m(c3: Candle3m) {
    this.last3m.push(c3);
    if (this.last3m.length > 50) this.last3m.shift();

    // Invalidate existing active FVG using latest 3m close (on subsequent bars)
    if (this.activeFvg && !this.activeFvg.invalid) {
      if (this.activeFvg.side === "buy") {
        if (c3.close < this.activeFvg.bottom) this.activeFvg.invalid = true;
      } else {
        if (c3.close > this.activeFvg.top) this.activeFvg.invalid = true;
      }
    }

    // Need 3 closed 3m candles to evaluate FVG (current + 2 back)
    if (this.last3m.length < 3) return;

    const c0 = this.last3m[this.last3m.length - 1];
    const c2 = this.last3m[this.last3m.length - 3];

    const bullFvg = c0.low > c2.high;
    const bearFvg = c0.high < c2.low;

    if (bullFvg) {
      const top = Math.max(c0.low, c2.high);
      const bottom = Math.min(c0.low, c2.high);

      this.activeFvg = {
        side: "buy",
        time: c0.time,
        top,
        bottom,
        invalid: false,
        retested: false,
        traded: false,
      };
      return;
    }

    if (bearFvg) {
      const top = Math.max(c2.low, c0.high);
      const bottom = Math.min(c2.low, c0.high);

      this.activeFvg = {
        side: "sell",
        time: c0.time,
        top,
        bottom,
        invalid: false,
        retested: false,
        traded: false,
      };
      return;
    }
  }
}
