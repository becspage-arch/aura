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
  retestIgnoredLogged?: boolean;
};

function floorTo3m(t: number): number {
  return Math.floor(t / 180) * 180;
}

function isNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fvgBounds(fvg: { top: number; bottom: number }) {
  const top = Math.max(fvg.top, fvg.bottom);
  const bottom = Math.min(fvg.top, fvg.bottom);
  return { top, bottom };
}

function segTouch(ea: number, eb: number, lo: number, hi: number): boolean {
  const emaMin = Math.min(ea, eb);
  const emaMax = Math.max(ea, eb);
  return emaMin <= hi && emaMax >= lo;
}

function fvgSummary(f: FvgBox | null) {
  if (!f) return null;
  return {
    side: f.side,
    time: f.time,
    top: f.top,
    bottom: f.bottom,
    invalid: f.invalid,
    retested: f.retested,
    traded: f.traded,
  };
}

export class CorePlus315Engine {
  private cfg: CorePlus315Config;

  // rolling windows
  private last15s: Candle15s[] = []; // keep small window; we only need last 3 + scan for retest

  // 3m series for FVG detection (need last 3 closed 3m candles)
  private last3m: Candle3m[] = [];

  // --- EMA50 on 3m close (to match Pine) ---
  private readonly emaLen = 50;
  private emaSeedCloses: number[] = [];
  private ema50: number | null = null;
  private last3mEma: (number | null)[] = []; // aligns 1:1 with last3m

  // active FVG (we follow “latest QUALIFIED box” semantics like your indicator)
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

    // Stop logic:
    // - If we have an active 3m FVG, stop is the OPPOSITE edge of that 3m FVG (matches PineScript).
    // - If no active FVG yet, fall back to the "b candle" stop so blocked candidates still have a value.
    let stopPrice =
      side === "buy"
        ? b.low
        : b.high;

    if (this.activeFvg) {
      const { top, bottom } = fvgBounds(this.activeFvg);
      stopPrice = side === "buy" ? bottom : top;
    }

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
        fvgTop: this.activeFvg ? fvgBounds(this.activeFvg).top : NaN,
        fvgBottom: this.activeFvg ? fvgBounds(this.activeFvg).bottom : NaN,
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
    // IMPORTANT: Pine only starts retest logic AFTER the 3m candle that created the FVG has closed.
    // So we must NOT mark retested on 15s candles that belong to the same 3m bucket as the FVG creation candle.
    if (!this.activeFvg.retested) {
      const isSame3mBucketAsFvgCreation = floorTo3m(d.time) === this.activeFvg.time;

      const { top, bottom } = fvgBounds(this.activeFvg);
      const overlaps = d.low <= top && d.high >= bottom;

      if (isSame3mBucketAsFvgCreation) {
        // This is the exact Pine behaviour we’re enforcing:
        // ignore retests inside the same 3m candle that created the FVG.
        if (overlaps && !this.activeFvg.retestIgnoredLogged) {
          this.activeFvg.retestIgnoredLogged = true;
          console.log("[coreplus315] RETEST_IGNORED_SAME_3M_BUCKET", {
            fvgTime: this.activeFvg.time,
            fvgIso: new Date(this.activeFvg.time * 1000).toISOString(),
            candle15sTime: d.time,
            candle15sIso: new Date(d.time * 1000).toISOString(),
            top,
            bottom,
            cLow: d.low,
            cHigh: d.high,
          });
        }
      } else {
        if (overlaps) {
          this.activeFvg.retested = true;
          console.log("[coreplus315] RETEST_CONFIRMED", {
            fvgTime: this.activeFvg.time,
            fvgIso: new Date(this.activeFvg.time * 1000).toISOString(),
            candle15sTime: d.time,
            candle15sIso: new Date(d.time * 1000).toISOString(),
            top,
            bottom,
            cLow: d.low,
            cHigh: d.high,
          });
        }
      }
    }

    if (!this.activeFvg.retested) {
      candidateBase.meta.retested = false;
      const { top, bottom } = fvgBounds(this.activeFvg);
      candidateBase.meta.fvgTop = top;
      candidateBase.meta.fvgBottom = bottom;
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
    // Stop must be on the correct side of entry
    if (side === "buy" && stopPrice >= entryPrice) {
      return { kind: "blocked", reason: "STOP_INVALID", candidate: candidateBase };
    }
    if (side === "sell" && stopPrice <= entryPrice) {
      return { kind: "blocked", reason: "STOP_INVALID", candidate: candidateBase };
    }

    const stopDist = Math.abs(entryPrice - stopPrice);

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
        fvgTop: fvgBounds(this.activeFvg).top,
        fvgBottom: fvgBounds(this.activeFvg).bottom,
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
   * DB-backed / builder-backed 3m feed.
   * Call this ONLY when a 3m candle is truly "closed" by the 3m builder.
   */
  ingestClosed3m(c3: Candle3m) {
    this.onClosed3m(c3);
  }

  /**
   * Detect new 3m FVG and invalidation (mirrors your indicator defaults: onlyWhen50=false etc).
   */
  private onClosed3m(c3: Candle3m) {
    console.log(
      `[coreplus315] CLOSED_3M ${JSON.stringify({
        time: c3.time,
        iso: new Date(c3.time * 1000).toISOString(),
        bucketMod: c3.time % 180,
        o: c3.open,
        h: c3.high,
        l: c3.low,
        c: c3.close,
      })}`
    );

    // --- Update EMA50 on 3m close (matches Pine ta.ema(close, 50) on the 3m series) ---
    const alpha = 2 / (this.emaLen + 1);

    if (this.ema50 == null) {
      // seed with SMA of first 50 closes (TradingView-style practical match in live conditions)
      this.emaSeedCloses.push(c3.close);
      if (this.emaSeedCloses.length > this.emaLen) this.emaSeedCloses.shift();

      if (this.emaSeedCloses.length === this.emaLen) {
        const sma =
          this.emaSeedCloses.reduce((acc, v) => acc + v, 0) / this.emaLen;
        this.ema50 = sma;
      }
    } else {
      this.ema50 = alpha * c3.close + (1 - alpha) * this.ema50;
    }

    const ema0 = this.ema50;

    // store series + ema aligned
    this.last3m.push(c3);
    this.last3mEma.push(ema0);

    if (this.last3m.length > 50) this.last3m.shift();
    if (this.last3mEma.length > 50) this.last3mEma.shift();

    // Invalidate existing active FVG using latest 3m close
    // IMPORTANT: never invalidate on the SAME 3m candle that created the FVG.
    if (this.activeFvg && !this.activeFvg.invalid && c3.time !== this.activeFvg.time) {
      const { top, bottom } = fvgBounds(this.activeFvg);

      let nowInvalid = false;

      if (this.activeFvg.side === "buy") {
        if (c3.close < bottom) nowInvalid = true;
      } else {
        if (c3.close > top) nowInvalid = true;
      }

      if (nowInvalid) {
        this.activeFvg.invalid = true;

        // Defensive: clear retest flagging state so next FVG starts clean
        this.activeFvg.retestIgnoredLogged = false;
      }
    }

    // Need 3 closed 3m candles to evaluate FVG (current + 2 back)
    if (this.last3m.length < 3) return;
    if (this.last3mEma.length < 3) return;

    const c0 = this.last3m[this.last3m.length - 1];
    const c1 = this.last3m[this.last3m.length - 2];
    const c2 = this.last3m[this.last3m.length - 3];

    const e0 = this.last3mEma[this.last3mEma.length - 1];
    const e1 = this.last3mEma[this.last3mEma.length - 2];
    const e2 = this.last3mEma[this.last3mEma.length - 3];

    // If EMA isn't seeded yet, we cannot qualify FVGs (live trading will be seeded quickly).
    if (e0 == null || e1 == null || e2 == null) {
    console.log(
      "[coreplus315] EVAL_3M_SUMMARY " +
        JSON.stringify({
          t: c0.time,
          iso: new Date(c0.time * 1000).toISOString(),
          emaSeeded: false,
          emaLen: this.emaLen,
          seedCount: this.emaSeedCloses.length,
          prevFvg: fvgSummary(this.activeFvg),
          action: "KEEP_PREVIOUS",
          note: "EMA not seeded yet - skipping FVG qualification",
        })
    );
      return;
    }

    // Raw FVG detection (same as Pine)
    const bullFvg = c0.low > c2.high;
    const bearFvg = c0.high < c2.low;

    // Pine "touchAny" logic using EMA segment touch across the 3 bars:
    // touchBar2 uses ema[2] -> ema[1] against candle2 range
    // touchBar1 uses ema[1] -> ema[0] against candle1 range
    // touchBar0 uses ema[1] -> ema[0] against candle0 range
    const touchBar2 = segTouch(e2, e1, c2.low, c2.high);
    const touchBar1 = segTouch(e1, e0, c1.low, c1.high);
    const touchBar0 = segTouch(e1, e0, c0.low, c0.high);
    const touchAny = touchBar2 || touchBar1 || touchBar0;

    const closeAbove = c0.close > e0;
    const closeBelow = c0.close < e0;

    // --- Qualified FVG creation rules (your strategy / Pine defaults: onlyWhen50=false) ---
    const bullQualified = bullFvg && touchAny && closeAbove;
    const bearQualified = bearFvg && touchAny && closeBelow;

    if (bullFvg || bearFvg) {
      console.log("[coreplus315] FVG_CANDIDATE", {
        time: c0.time,
        iso: new Date(c0.time * 1000).toISOString(),
        bullFvg,
        bearFvg,
        touchAny,
        touchBar2,
        touchBar1,
        touchBar0,
        ema0: e0,
        c0_close: c0.close,
        closeAbove,
        closeBelow,
        bullQualified,
        bearQualified,
        keptPrevious: !(bullQualified || bearQualified),
        prevFvg: this.activeFvg
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
      });
    }

    // ----- Structured 3m evaluation summary (once per closed 3m candle) -----
    const summary = {
      t: c0.time,
      iso: new Date(c0.time * 1000).toISOString(),

      emaSeeded: true,
      ema0: e0,
      ema1: e1,
      ema2: e2,

      raw: { bullFvg, bearFvg },
      emaFilter: {
        touchAny,
        touchBar2,
        touchBar1,
        touchBar0,
        closeAbove,
        closeBelow,
      },
      qualified: { bullQualified, bearQualified },

      prevFvg: fvgSummary(this.activeFvg),
      action: bullQualified
        ? "ADOPT_BULL"
        : bearQualified
          ? "ADOPT_BEAR"
          : "KEEP_PREVIOUS",
    };

    console.log("[coreplus315] EVAL_3M_SUMMARY " + JSON.stringify(summary));

    // If candidate FVG is NOT qualified, ignore it (previous FVG stays active/invalid)
    if (!bullQualified && !bearQualified) return;

    if (bullQualified) {
      const top = c0.low;
      const bottom = c2.high;

      console.log(
        `[coreplus315] NEW_3M_FVG kind=bull side=buy top=${top} bottom=${bottom} ` +
          `ema0=${e0} c0_close=${c0.close} touchAny=${touchAny}`
      );

      this.activeFvg = {
        side: "buy",
        time: c0.time,
        top,
        bottom,
        invalid: false,
        retested: false,
        traded: false,
        retestIgnoredLogged: false,
      };
      return;
    }

    if (bearQualified) {
      const top = c2.low;
      const bottom = c0.high;

      console.log(
        `[coreplus315] NEW_3M_FVG kind=bear side=sell top=${top} bottom=${bottom} ` +
          `ema0=${e0} c0_close=${c0.close} touchAny=${touchAny}`
      );

      this.activeFvg = {
        side: "sell",
        time: c0.time,
        top,
        bottom,
        invalid: false,
        retested: false,
        traded: false,
        retestIgnoredLogged: false,
      };
      return;
    }
  }
}
