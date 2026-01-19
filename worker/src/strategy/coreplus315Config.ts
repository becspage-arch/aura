// worker/src/strategy/coreplus315Config.ts

export type CorePlus315Config = {
  // Risk & exits
  riskUsd: number;            // e.g. 200
  rr: number;                 // e.g. 2 (TP = rr * risk)
  maxStopTicks: number;       // e.g. 45 (hard cap)

  // Execution (hard-coded for v1, but becomes per-user later)
  entryType: "market" | "limit"; // v1 still uses market; limit wiring comes later

  // Instrument info (comes from broker / contract spec)
  tickSize: number;           // e.g. 0.1 for MGC
  tickValue: number;          // e.g. $1 per tick for MGC (as per ProjectX)
};

export const COREPLUS315_DEFAULTS: Omit<CorePlus315Config, "tickSize" | "tickValue"> = {
  riskUsd: 200,
  rr: 2,
  maxStopTicks: 45,
  entryType: "market",
};

// Resolve COREPLUS315 config using user strategy settings.
// For now, we ONLY override riskUsd.
// All other values remain hardcoded defaults until we migrate them.
export function resolveCorePlus315ConfigFromUser(args: {
  tickSize: number;
  tickValue: number;
  userSettings?: {
    riskUsd?: number | null;
  } | null;
}) {
  const { tickSize, tickValue, userSettings } = args;

  const riskUsdRaw = userSettings?.riskUsd;
  const riskUsd =
    typeof riskUsdRaw === "number" &&
    Number.isFinite(riskUsdRaw) &&
    riskUsdRaw > 0
      ? riskUsdRaw
      : COREPLUS315_DEFAULTS.riskUsd;

  return {
    ...COREPLUS315_DEFAULTS,
    riskUsd, // overridden from user settings if valid
    tickSize,
    tickValue,
  };
}

export function buildCorePlus315Config(params: {
  tickSize: number;
  tickValue: number;
  overrides?: Partial<Omit<CorePlus315Config, "tickSize" | "tickValue">>;
}): CorePlus315Config {
  const tickSize = Number(params.tickSize);
  const tickValue = Number(params.tickValue);

  if (!Number.isFinite(tickSize) || tickSize <= 0) {
    throw new Error(`Invalid tickSize: ${params.tickSize}`);
  }
  if (!Number.isFinite(tickValue) || tickValue <= 0) {
    throw new Error(`Invalid tickValue: ${params.tickValue}`);
  }

  return {
    ...COREPLUS315_DEFAULTS,
    ...(params.overrides ?? {}),
    tickSize,
    tickValue,
  };
}

/**
 * Convert price distance to ticks using tickSize.
 */
export function priceToTicks(distPrice: number, tickSize: number): number {
  const ticks = distPrice / tickSize;
  return Math.round(ticks * 1e6) / 1e6; // keep it stable for logs
}

/**
 * Position sizing: "closest to $riskUsd (round down, always <= riskUsd)".
 *
 * contracts = floor( riskUsd / (stopTicks * tickValue) )
 * returns 0 if stopTicks <= 0 or if even 1 contract would exceed risk.
 */
export function contractsForRisk(params: {
  riskUsd: number;
  stopTicks: number;
  tickValue: number;
}): number {
  const riskUsd = Number(params.riskUsd);
  const stopTicks = Number(params.stopTicks);
  const tickValue = Number(params.tickValue);

  if (!Number.isFinite(riskUsd) || riskUsd <= 0) return 0;
  if (!Number.isFinite(stopTicks) || stopTicks <= 0) return 0;
  if (!Number.isFinite(tickValue) || tickValue <= 0) return 0;

  const riskPerContract = stopTicks * tickValue;
  if (riskPerContract <= 0) return 0;

  const qty = Math.floor(riskUsd / riskPerContract);
  return qty > 0 ? qty : 0;
}

/**
 * Take-profit distance in ticks for a given stopTicks and RR.
 * TP ticks = stopTicks * rr
 */
export function tpTicks(stopTicks: number, rr: number): number {
  const s = Number(stopTicks);
  const r = Number(rr);
  if (!Number.isFinite(s) || s <= 0) return 0;
  if (!Number.isFinite(r) || r <= 0) return 0;
  return s * r;
}
