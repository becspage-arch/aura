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

export type EvalReason =
  | "NO_ACTIVE_FVG"
  | "FVG_INVALID"
  | "FVG_ALREADY_TRADED"
  | "NOT_RETESTED"
  | "DIRECTION_MISMATCH"
  | "NO_EXPANSION_PATTERN"
  | "STOP_INVALID"
  | "STOP_TOO_BIG"
  | "CONTRACTS_ZERO";

export type TradeEvalResult =
  | { kind: "none"; reason: "NO_EXPANSION_PATTERN" } // we’ll only return "none" for this (to avoid huge DB spam)
  | { kind: "blocked"; reason: EvalReason; candidate: TradeIntent }
  | { kind: "intent"; intent: TradeIntent };

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
  /**
   * Evaluate a closed 15s candle and return:
   * - intent: a valid TradeIntent
   * - blocked: a "candidate" intent + reason (near-miss)
   * - none: no expansion pattern (avoid spamming DB every candle)
   */
  evaluateClosed15s(c: Candle15s): TradeEvalResult {
    // store 15s
    this.last15s.push(c);
    if (this.last15s.length > 600) this.last15s.shift();

    // build/close 3m
    const maybe3m = this.ingest15sInto3m(c);
    if (maybe3m) {
      this.onClosed3m(maybe3m);
    }

    // Need last 3 closed 15s candles to detect expansion
    if (this.last15s.length < 3) {
      return { kind: "none", reason: "NO_EXPANSION_PATTERN" };
    }

    const a = this.last15s[this.last15s.length - 3];
    const b = this.last15s[this.last15s.length - 2];
    const d = this.last15s[this.last15s.length - 1];

    // 3-candle expansion patterns (same as your Pine)
    const bull15 = d.low > a.high;
    const bear15 = d.high < a.low;

    // If there’s no expansion pattern at all, don’t emit anything (keeps DB clean)
    if (!bull15 && !bear15) {
      return { kind: "none", reason: "NO_EXPANSION_PATTERN" };
    }

    // Prepare best-effort values for a “candidate”
    const entryTime = d.time + 15;
    const entryPrice = d.close;

    // If no active FVG, we can still record a blocked candidate, but we need a “side”.
    // We’ll infer side from expansion direction as a fallback (buy for bull15, sell for bear15).
    const inferredSide: Side = bull15 ? "buy" : "sell";

    const side: Side = this.activeFvg?.side ?? inferredSide;
    const fvgTime = this.activeFvg?.time ?? floorTo3m(d.time);

    // Stop is based on the second candle
    const stopPrice = side === "buy" ? b.low : b.high;

    // TP will be filled in later if we get past risk sizing
    let takeProfitPrice = entryPrice;

    // Build a candidate intent shell that we can return even when blocked
    const candidateBase: TradeIntent = {
      strategy: "coreplus315",
      symbol: c.symbol,
      side,
      entryTime,
      fvgTime,
      entryPrice,
      stopPrice,
      takeProfitPrice,
      stopTicks: 0,
      tpTicks: 0,
      rr: this.cfg.rr,
      contracts: 0,
      riskUsdPlanned: 0,
      meta: {
        fvgTop: this.activeFvg?.top ?? NaN,
        fvgBottom: this.activeFvg?.bottom ?? NaN,
        retested: Boolean(this.activeFvg?.retested),
      },
    };

    // FVG lifecycle checks
    if (!this.activeFvg) {
      return { kind: "blocked", reason: "NO_ACTIVE_FVG", candidate: candidateBase };
    }
    if (this.activeFvg.invalid) {
      return { kind: "blocked", reason: "FVG_INVALID", candidate: candidateBase };
    }
    if (this.activeFvg.traded) {
      return { kind: "blocked", reason: "FVG_ALREADY_TRADED", candidate: candidateBase };
    }

    // Retest detection (any 15s candle that overlaps the FVG zone)
    if (!this.activeFvg.retested) {
      const overlaps = c.low <= this.activeFvg.top && c.high >= this.activeFvg.bottom;
      if (overlaps) this.activeFvg.retested = true;
    }

    if (!this.activeFvg.retested) {
      candidateBase.meta.retested = false;
      candidateBase.meta.fvgTop = this.activeFvg.top;
      candidateBase.meta.fvgBottom = this.activeFvg.bottom;
      return { kind: "blocked", reason: "NOT_RETESTED", candidate: candidateBase };
    }

    // Direction must match active FVG
    if (side === "buy" && !bull15) {
      return { kind: "blocked", reason: "DIRECTION_MISMATCH", candidate: candidateBase };
    }
    if (side === "sell" && !bear15) {
      return { kind: "blocked", reason: "DIRECTION_MISMATCH", candidate: candidateBase };
    }

    // Risk checks
    const stopDist = side === "buy" ? entryPrice - stopPrice : stopPrice - entryPrice;
    if (!isNumber(stopDist) || stopDist <= 0) {
      return { kind: "blocked", reason: "STOP_INVALID", candidate: candidateBase };
    }

    const stopTicks = priceToTicks(stopDist, this.cfg.tickSize);
    if (!isNumber(stopTicks) || stopTicks <= 0) {
      return { kind: "blocked", reason: "STOP_INVALID", candidate: candidateBase };
    }

    candidateBase.stopTicks = stopTicks;

    // Enforce max stop ticks
    if (stopTicks > this.cfg.maxStopTicks) {
      return { kind: "blocked", reason: "STOP_TOO_BIG", candidate: candidateBase };
    }

    const contracts = contractsForRisk({
      riskUsd: this.cfg.riskUsd,
      stopTicks,
      tickValue: this.cfg.tickValue,
    });

    if (contracts <= 0) {
      return { kind: "blocked", reason: "CONTRACTS_ZERO", candidate: candidateBase };
    }

    const tpT = tpTicks(stopTicks, this.cfg.rr);
    const tpDist = tpT * this.cfg.tickSize;

    takeProfitPrice = side === "buy" ? entryPrice + tpDist : entryPrice - tpDist;

    const plannedRisk = contracts * stopTicks * this.cfg.tickValue;

    const intent: TradeIntent = {
      ...candidateBase,
      fvgTime: this.activeFvg.time,
      stopTicks,
      tpTicks: tpT,
      contracts,
      riskUsdPlanned: plannedRisk,
      takeProfitPrice,
      meta: {
        fvgTop: this.activeFvg.top,
        fvgBottom: this.activeFvg.bottom,
        retested: this.activeFvg.retested,
      },
    };

    return { kind: "intent", intent };
  }

  /**
   * Backwards-compatible API used elsewhere (replay, etc).
   * Returns intent only, otherwise null.
   */
  ingestClosed15s(c: Candle15s): TradeIntent | null {
    const r = this.evaluateClosed15s(c);
    if (r.kind === "intent") return r.intent;
    return null;
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
      // Pine:
      // bullTop := low
      // bullBottom := high[2]
      const top = c0.low;
      const bottom = c2.high;

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
      // Pine:
      // bearTop := low[2]
      // bearBottom := high
      const top = c2.low;
      const bottom = c0.high;

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
