// src/lib/auraCopy.ts
// Single source of truth for all customer-facing wording around Aura.
// Use this everywhere (Activity, Charts, Live Trading, etc.) so language is consistent.

export type AuraDecisionStatus = "DETECTED" | "BLOCKED" | "TAKEN";
export type AuraSide = "BUY" | "SELL";

export type ActivityScopeCopyKey = "user" | "user+aura" | "all";
export type SystemPresetCopyKey = "important" | "errors" | "settings" | "all";

/**
 * -----------------------------
 * Activity scope labels + help
 * -----------------------------
 */
export const ACTIVITY_SCOPE_COPY: Record<
  ActivityScopeCopyKey,
  { label: string; helper: string }
> = {
  user: {
    label: "My actions",
    helper: "Shows what you changed - settings, toggles, controls, etc.",
  },
  "user+aura": {
    label: "Trading decisions",
    helper: "Shows every trade Aura considered - entered or skipped, with the reason.",
  },
  all: {
    label: "System & decisions",
    helper: "Adds important system messages - issues, settings changes, execution steps.",
  },
};

/**
 * -----------------------------
 * System preset labels + help
 * -----------------------------
 */
export const SYSTEM_PRESET_COPY: Record<
  SystemPresetCopyKey,
  { label: string; helper: string }
> = {
  important: {
    label: "Important",
    helper: "Only the stuff you’d care about - warnings, errors, and key actions.",
  },
  errors: {
    label: "Warnings & errors",
    helper: "Only problems and things that might need attention.",
  },
  settings: {
    label: "Settings changes",
    helper: "When you (or Aura) changed a setting.",
  },
  all: {
    label: "All (clean)",
    helper: "All system messages except high-volume background chatter.",
  },
};

/**
 * -----------------------------
 * Core decision wording
 * -----------------------------
 */
export function sideLabel(side: AuraSide): string {
  return side === "BUY" ? "Buy" : "Sell";
}

export function decisionVerb(status: AuraDecisionStatus): string {
  if (status === "TAKEN") return "Entered";
  if (status === "BLOCKED") return "Skipped";
  return "Watched";
}

export function decisionBadgeLabel(status: AuraDecisionStatus): string {
  // Short label suitable for chips/badges
  if (status === "TAKEN") return "Entered";
  if (status === "BLOCKED") return "Skipped";
  return "Watched";
}

/**
 * -----------------------------
 * Block reason (Aura explanations)
 * -----------------------------
 * Keys match StrategyBlockReason enum values.
 */
const BLOCK_REASON_LABEL: Record<string, string> = {
  // Controls / safety
  IN_TRADE: "Already in a trade",
  PAUSED: "Paused",
  KILL_SWITCH: "Kill switch is on",
  NOT_LIVE_CANDLE: "Not a live candle",
  INVALID_BRACKET: "Order protection wasn’t valid",
  EXECUTION_FAILED: "Broker rejected the order",
  OUTSIDE_TRADING_WINDOWS: "Outside your trading session",

  // Strategy / logic
  NO_ACTIVE_FVG: "No valid setup active",
  FVG_INVALID: "Setup was invalidated",
  FVG_ALREADY_TRADED: "Setup already traded",
  NOT_RETESTED: "No retest yet",
  DIRECTION_MISMATCH: "Direction didn’t match",
  NO_EXPANSION_PATTERN: "No confirmation pattern",
  STOP_INVALID: "Stop level wasn’t valid",
  STOP_TOO_BIG: "Stop was too large",
  CONTRACTS_ZERO: "Position size was 0",
};

export function blockReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "";
  return BLOCK_REASON_LABEL[reason] ?? reason;
}

/**
 * -----------------------------
 * Titles used in feeds/cards
 * -----------------------------
 */
export function tradingDecisionTitle(symbol: string): string {
  return `Trading decision • ${symbol}`;
}

export function tradingDecisionSummary(params: {
  status: AuraDecisionStatus;
  side: AuraSide;
  contracts?: number | null;
  blockReason?: string | null;
}): string {
  const verb = decisionVerb(params.status);
  const side = sideLabel(params.side);

  if (params.status === "TAKEN") {
    const n = params.contracts ?? null;
    return n != null ? `${verb} - ${side} • ${n} contracts` : `${verb} - ${side}`;
  }

  if (params.status === "BLOCKED") {
    const r = blockReasonLabel(params.blockReason);
    return r ? `${verb} - ${r}` : `${verb}`;
  }

  // DETECTED
  return `${verb} - ${side}`;
}

/**
 * -----------------------------
 * Optional: “noise” replacement wording
 * -----------------------------
 * Use this instead of saying "noise" in UI copy.
 */
export const COPY_MISC = {
  noNoiseShort: "background updates hidden",
  noNoiseLong:
    "Background updates are hidden so you only see useful messages.",
};
