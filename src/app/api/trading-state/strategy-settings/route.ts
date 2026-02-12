// src/app/api/trading-state/strategy-settings/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";
import { publishToUser } from "@/lib/ably/server";
import { writeAuditLog, writeEventLog } from "@/lib/logging/server";

/**
 * Strategy settings are per-user and stored in UserTradingState.strategySettings (Json).
 * This route mirrors risk-settings but with a richer shape.
 *
 * UI can POST partial patches; we merge, then normalize.
 */

type StrategyMode = "paper" | "live";

type StrategySettings = {
  // High-level
  mode: StrategyMode; // paper | live
  preset: "coreplus315";

  // Instruments / sessions
  symbols: string[]; // e.g. ["MGC"]
  sessions: {
    asia: boolean;
    london: boolean;
    ny: boolean;
  };

  // Risk & exits
  riskUsd: number;
  rr: number;
  maxStopTicks: number;

  // Position sizing (v1: keep simple)
  sizing: {
    mode: "risk_based" | "fixed_contracts";
    fixedContracts: number; // used when mode=fixed_contracts
  };

  // 315 CorePlus guardrails/filters
  coreplus315: {
    maxStopoutsPerSession: number; // 0 = disabled
    cooldownMinutesAfterStopout: number; // 0 = disabled
    maxTradesPerSession: number; // 0 = disabled
    requireBodyDominancePct: number; // e.g. 90
    emaFilterEnabled: boolean; // placeholder toggle, UI can wire later
    entryTiming: "immediate" | "wait_confirm"; // placeholder
  };

  // Execution preferences
  execution: {
    allowMultipleTradesPerSession: boolean;
    allowTradeStacking: boolean;
    requireFlatBeforeNewEntry: boolean;
  };

  // Safety
  safety: {
    maxDailyLossUsd: number; // 0 = disabled
    maxDailyProfitUsd: number; // 0 = disabled
    maxConsecutiveLosses: number; // 0 = disabled
    autoPauseEnabled: boolean;
  };
};

const DEFAULTS: StrategySettings = {
  mode: "paper",
  preset: "coreplus315",

  symbols: ["MGC"],
  sessions: { asia: false, london: false, ny: true },

  riskUsd: 50,
  rr: 2,
  maxStopTicks: 50,

  sizing: { mode: "risk_based", fixedContracts: 1 },

  coreplus315: {
    maxStopoutsPerSession: 0,
    cooldownMinutesAfterStopout: 0,
    maxTradesPerSession: 0,
    requireBodyDominancePct: 90,
    emaFilterEnabled: false,
    entryTiming: "immediate",
  },

  execution: {
    allowMultipleTradesPerSession: true,
    allowTradeStacking: true,
    requireFlatBeforeNewEntry: true,
  },

  safety: {
    maxDailyLossUsd: 0,
    maxDailyProfitUsd: 0,
    maxConsecutiveLosses: 0,
    autoPauseEnabled: true,
  },
};

function clampNumber(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toBool(v: unknown, fallback: boolean) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

function normalizeStringArray(v: unknown, fallback: string[]) {
  if (!Array.isArray(v)) return fallback;
  const out = v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return out.length ? Array.from(new Set(out)) : fallback;
}

function normalize(input: unknown): StrategySettings {
  const obj = (input ?? {}) as Partial<StrategySettings>;

  const mode: StrategyMode = obj.mode === "live" ? "live" : "paper";

  const sessionsIn = (obj.sessions ?? {}) as Partial<StrategySettings["sessions"]>;
  const sizingIn = (obj.sizing ?? {}) as Partial<StrategySettings["sizing"]>;
  const cpIn = (obj.coreplus315 ?? {}) as Partial<StrategySettings["coreplus315"]>;
  const exIn = (obj.execution ?? {}) as Partial<StrategySettings["execution"]>;
  const sfIn = (obj.safety ?? {}) as Partial<StrategySettings["safety"]>;

  const sizingMode =
    sizingIn.mode === "fixed_contracts" ? "fixed_contracts" : "risk_based";

  const entryTiming =
    cpIn.entryTiming === "wait_confirm" ? "wait_confirm" : "immediate";

  return {
    mode,
    preset: "coreplus315",

    symbols: normalizeStringArray(obj.symbols, DEFAULTS.symbols),

    sessions: {
      asia: toBool(sessionsIn.asia, DEFAULTS.sessions.asia),
      london: toBool(sessionsIn.london, DEFAULTS.sessions.london),
      ny: toBool(sessionsIn.ny, DEFAULTS.sessions.ny),
    },

    riskUsd: clampNumber(obj.riskUsd, 1, 5000, DEFAULTS.riskUsd),
    rr: clampNumber(obj.rr, 0.5, 10, DEFAULTS.rr),
    maxStopTicks: clampNumber(obj.maxStopTicks, 1, 500, DEFAULTS.maxStopTicks),

    sizing: {
      mode: sizingMode,
      fixedContracts: clampNumber(
        sizingIn.fixedContracts,
        1,
        100,
        DEFAULTS.sizing.fixedContracts
      ),
    },

    coreplus315: {
      maxStopoutsPerSession: clampNumber(
        cpIn.maxStopoutsPerSession,
        0,
        50,
        DEFAULTS.coreplus315.maxStopoutsPerSession
      ),
      cooldownMinutesAfterStopout: clampNumber(
        cpIn.cooldownMinutesAfterStopout,
        0,
        240,
        DEFAULTS.coreplus315.cooldownMinutesAfterStopout
      ),
      maxTradesPerSession: clampNumber(
        cpIn.maxTradesPerSession,
        0,
        50,
        DEFAULTS.coreplus315.maxTradesPerSession
      ),
      requireBodyDominancePct: clampNumber(
        cpIn.requireBodyDominancePct,
        50,
        100,
        DEFAULTS.coreplus315.requireBodyDominancePct
      ),
      emaFilterEnabled: toBool(
        cpIn.emaFilterEnabled,
        DEFAULTS.coreplus315.emaFilterEnabled
      ),
      entryTiming,
    },

    execution: {
      allowMultipleTradesPerSession: toBool(
        exIn.allowMultipleTradesPerSession,
        DEFAULTS.execution.allowMultipleTradesPerSession
      ),
      allowTradeStacking: toBool(
        exIn.allowTradeStacking,
        DEFAULTS.execution.allowTradeStacking
      ),
      requireFlatBeforeNewEntry: toBool(
        exIn.requireFlatBeforeNewEntry,
        DEFAULTS.execution.requireFlatBeforeNewEntry
      ),
    },

    safety: {
      maxDailyLossUsd: clampNumber(
        sfIn.maxDailyLossUsd,
        0,
        50000,
        DEFAULTS.safety.maxDailyLossUsd
      ),
      maxDailyProfitUsd: clampNumber(
        sfIn.maxDailyProfitUsd,
        0,
        50000,
        DEFAULTS.safety.maxDailyProfitUsd
      ),
      maxConsecutiveLosses: clampNumber(
        sfIn.maxConsecutiveLosses,
        0,
        50,
        DEFAULTS.safety.maxConsecutiveLosses
      ),
      autoPauseEnabled: toBool(
        sfIn.autoPauseEnabled,
        DEFAULTS.safety.autoPauseEnabled
      ),
    },
  };
}

function mergeAndNormalize(existing: unknown, patch: unknown): StrategySettings {
  const base = normalize(existing);
  const p = (patch ?? {}) as Record<string, unknown>;

  // Shallow merge for top-level, then allow nested objects to be patched too.
  // We merge nested objects individually so PATCH can be small.
  const merged = {
    ...base,
    ...p,
    sessions: { ...base.sessions, ...((p.sessions as any) ?? {}) },
    sizing: { ...base.sizing, ...((p.sizing as any) ?? {}) },
    coreplus315: { ...base.coreplus315, ...((p.coreplus315 as any) ?? {}) },
    execution: { ...base.execution, ...((p.execution as any) ?? {}) },
    safety: { ...base.safety, ...((p.safety as any) ?? {}) },
  };

  return normalize(merged);
}

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const state = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const strategySettings = normalize(state.strategySettings);

  // Optional: persist defaults if missing
  if (!state.strategySettings) {
    await db.userTradingState.update({
      where: { userId: user.id },
      data: { strategySettings },
    });
  }

  return Response.json({ ok: true, strategySettings });
}

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const current = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const nextStrategySettings = mergeAndNormalize(current.strategySettings, body);

  const next = await db.userTradingState.update({
    where: { userId: user.id },
    data: { strategySettings: nextStrategySettings },
  });

  await writeAuditLog(user.id, "STRATEGY_SETTINGS_UPDATED", nextStrategySettings);

  await writeEventLog({
    type: "config_changed",
    level: "info",
    message: "Strategy settings updated",
    data: nextStrategySettings,
    userId: user.id,
  });

  await publishToUser(clerkUserId, "strategy_settings_update", {
    strategySettings: normalize(next.strategySettings),
  });

  return Response.json({
    ok: true,
    strategySettings: normalize(next.strategySettings),
  });
}
