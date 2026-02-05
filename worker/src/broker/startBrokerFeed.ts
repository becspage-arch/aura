import { env, DRY_RUN } from "../env.js";
import { PrismaClient } from "@prisma/client";
import { createBroker } from "./createBroker.js";
import { ProjectXMarketHub } from "./projectxMarketHub.js";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Candle15sAggregator } from "../candles/candle15sAggregator.js";
import {
  CorePlus315Engine,
  type Candle15s as StratCandle15s,
} from "../strategy/coreplus315Engine.js";
import { buildBracketFromIntent } from "../trading/buildBracket.js";
import { createAblyRealtime } from "../ably.js";
import { executeBracket } from "../execution/executeBracket.js";

console.log("[startBrokerFeed.ts] LOADED", {
  MANUAL_EXEC: process.env.MANUAL_EXEC ?? null,
  hasManualToken: Boolean((process.env.MANUAL_EXEC_TOKEN || "").trim()),
  AURA_CLERK_USER_ID: process.env.AURA_CLERK_USER_ID ?? null,
});

// --- quote persist throttle (per instrument) ---
const lastPersistAtByInstrument = new Map<string, number>();
const PERSIST_EVERY_MS = 250;

const candle15s = new Candle15sAggregator();

export type BrokerEventName =
  | "broker.connected"
  | "broker.authorized"
  | "broker.ready"
  | "broker.error"
  | "broker.market.quote"
  | "candle.15s.closed"
  | "exec.bracket";

export type BrokerEvent = {
  name: BrokerEventName;
  ts: string;
  broker: string;
  data?: Record<string, unknown>;
};

type EmitFn = (event: BrokerEvent) => Promise<void> | void;

type ManualBracketPayload = {
  token: string;
  clerkUserId: string;

  contractId: string;
  side: "buy" | "sell";
  size: number;

  stopLossTicks: number;
  takeProfitTicks: number;
};

function isManualBracketPayload(x: any): x is ManualBracketPayload {
  return (
    x &&
    typeof x === "object" &&
    typeof x.token === "string" &&
    typeof x.clerkUserId === "string" &&
    typeof x.contractId === "string" &&
    (x.side === "buy" || x.side === "sell") &&
    Number.isFinite(Number(x.size)) &&
    Number.isFinite(Number(x.stopLossTicks)) &&
    Number.isFinite(Number(x.takeProfitTicks))
  );
}

let prisma: PrismaClient | null = null;
let prismaPool: Pool | null = null;

function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim() || "";

  if (!url) {
    throw new Error(
      "DATABASE_URL is missing/empty. Set it in worker/.env (or your shell env)."
    );
  }

  return url;
}

function getPrisma(): PrismaClient {
  if (prisma) return prisma;

  const url = getDatabaseUrl();

  prismaPool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(prismaPool);

  prisma = new PrismaClient({
    adapter,
    log: ["error"],
  });

  return prisma;
}

// --- user trading state guard (pause / kill switch) ---
let cachedUserTradingState:
  | { isPaused: boolean; isKillSwitched: boolean }
  | null = null;

let lastUserTradingStateCheck = 0;
const USER_STATE_REFRESH_MS = 5_000;

// --- per-user risk settings (DB-backed) ---
type RiskSettings = {
  riskUsd: number;
  rr: number;
  maxStopTicks: number;
  entryType: "market";
};

const RISK_DEFAULTS: RiskSettings = {
  riskUsd: 50,
  rr: 2,
  maxStopTicks: 50,
  entryType: "market",
};

let cachedRiskSettings: RiskSettings | null = null;
let lastRiskSettingsCheck = 0;
const RISK_SETTINGS_REFRESH_MS = 5_000;

function clampNumber(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeRiskSettings(input: unknown): RiskSettings {
  const obj = (input ?? {}) as Partial<RiskSettings>;

  return {
    riskUsd: clampNumber(obj.riskUsd, 1, 5000, RISK_DEFAULTS.riskUsd),
    rr: clampNumber(obj.rr, 0.5, 10, RISK_DEFAULTS.rr),
    maxStopTicks: clampNumber(
      obj.maxStopTicks,
      1,
      500,
      RISK_DEFAULTS.maxStopTicks
    ),
    entryType: "market", // v1 only
  };
}

async function getRiskSettings(): Promise<RiskSettings> {
  const clerkUserId = process.env.AURA_CLERK_USER_ID;
  console.log(`[${env.WORKER_NAME}] getUserTradingState for`, clerkUserId);

  if (!clerkUserId) return RISK_DEFAULTS;

  const now = Date.now();
  if (
    cachedRiskSettings &&
    now - lastRiskSettingsCheck < RISK_SETTINGS_REFRESH_MS
  ) {
    return cachedRiskSettings;
  }

  const db = getPrisma();

  const user = await db.userProfile.findUnique({
    where: { clerkUserId },
    include: { userState: true },
  });

  const riskSettings = normalizeRiskSettings(user?.userState?.riskSettings);

  cachedRiskSettings = riskSettings;
  lastRiskSettingsCheck = now;

  return riskSettings;
}

// --- debug: log pause/kill changes even when markets are closed ---
// (safe: read-only, no trading impact)
let lastLoggedUserState: { isPaused: boolean; isKillSwitched: boolean } | null =
  null;

setInterval(() => {
  void (async () => {
    try {
      // Only run when we're configured for a specific user
      if (!process.env.AURA_CLERK_USER_ID) return;
      if (process.env.DEBUG_USER_STATE !== "1") return;

      const s = await getUserTradingState();

      if (
        !lastLoggedUserState ||
        s.isPaused !== lastLoggedUserState.isPaused ||
        s.isKillSwitched !== lastLoggedUserState.isKillSwitched
      ) {
        console.log(`[${env.WORKER_NAME}] user trading state`, {
          clerkUserId: process.env.AURA_CLERK_USER_ID ?? null,
          ...s,
        });
        lastLoggedUserState = s;
      }
    } catch (e) {
      console.warn(`[${env.WORKER_NAME}] user state watcher failed`, e);
    }
  })();
}, 5_000);

async function getUserTradingState(): Promise<{
  isPaused: boolean;
  isKillSwitched: boolean;
}> {
  const clerkUserId = process.env.AURA_CLERK_USER_ID;
  if (!clerkUserId) {
    return { isPaused: false, isKillSwitched: false };
  }

  const now = Date.now();
  if (
    cachedUserTradingState &&
    now - lastUserTradingStateCheck < USER_STATE_REFRESH_MS
  ) {
    return cachedUserTradingState;
  }

  const db = getPrisma();

  const user = await db.userProfile.findUnique({
    where: { clerkUserId },
    include: { userState: true },
  });

  const state = {
    isPaused: Boolean(user?.userState?.isPaused),
    isKillSwitched: Boolean(user?.userState?.isKillSwitched),
  };

  cachedUserTradingState = state;
  lastUserTradingStateCheck = now;

  return state;
}

async function getStrategyEnabledForAccount(params: {
  brokerName: string;
  externalAccountId: string;
}): Promise<boolean> {
  const db = getPrisma();
  const key = `strategy.enabled:${params.brokerName}:${params.externalAccountId}`;

  const row = await db.systemState.findUnique({ where: { key } });

  // Default = enabled (backwards compatible)
  if (!row) return true;

  const v: any = row.value;
  if (typeof v === "boolean") return v;
  if (v && typeof v.enabled === "boolean") return v.enabled;

  return true;
}

async function shutdownPrisma(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
    }
  } catch (e) {
    console.warn(`[${env.WORKER_NAME}] prisma disconnect failed`, e);
  } finally {
    prisma = null;
  }

  try {
    if (prismaPool) {
      await prismaPool.end();
    }
  } catch (e) {
    console.warn(`[${env.WORKER_NAME}] pg pool end failed`, e);
  } finally {
    prismaPool = null;
  }
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Replay last N closed 15s candles from DB into the strategy engine.
 * This is ONLY to prove wiring works on weekends / when live quotes are empty.
 */
async function replayRecentCandlesOnce(params: {
  symbol: string;
  limit: number;
  engine: CorePlus315Engine;
}): Promise<void> {
  const db = getPrisma();

  const rows = await db.candle15s.findMany({
    where: { symbol: params.symbol },
    orderBy: { time: "desc" },
    take: params.limit,
  });

  const candlesAsc = rows
    .slice()
    .reverse()
    .map(
      (r): StratCandle15s => ({
        symbol: r.symbol,
        time: Number(r.time),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: r.volume == null ? null : Number(r.volume),
      })
    );

  console.log(`[${env.WORKER_NAME}] strategy replay start`, {
    symbol: params.symbol,
    limit: params.limit,
    loaded: candlesAsc.length,
    first: candlesAsc[0]?.time ?? null,
    last: candlesAsc[candlesAsc.length - 1]?.time ?? null,
  });

  let intents = 0;

  for (const c of candlesAsc) {
    const intent = params.engine.ingestClosed15s(c);
    if (intent) {
      intents++;
      console.log(`[${env.WORKER_NAME}] TRADE_INTENT (replay)`, intent);

      const bracket = buildBracketFromIntent(intent);
      console.log(`[${env.WORKER_NAME}] BRACKET (replay)`, bracket);
    }
  }

  console.log(`[${env.WORKER_NAME}] strategy replay done`, {
    intents,
  });
}

async function getUserIdentityForWorker(): Promise<{
  clerkUserId: string;
  userId: string;
}> {
  const clerkUserId = (process.env.AURA_CLERK_USER_ID || "").trim();
  if (!clerkUserId) {
    throw new Error("Missing AURA_CLERK_USER_ID for worker user identity");
  }

  const db = getPrisma();

  const user = await db.userProfile.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`No userProfile found for clerkUserId=${clerkUserId}`);
  }

  return { clerkUserId, userId: user.id };
}

async function getStrategySettingsForWorker() {
  const clerkUserId = (process.env.AURA_CLERK_USER_ID || "").trim();
  if (!clerkUserId) {
    throw new Error("Missing AURA_CLERK_USER_ID for worker config lookup");
  }

  const db = getPrisma();

  // 1) Map Clerk user -> internal userProfile id
  const user = await db.userProfile.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`No userProfile found for clerkUserId=${clerkUserId}`);
  }

  // 2) Read strategySettings from UserTradingState (this matches your API route)
  const state = await db.userTradingState.findUnique({
    where: { userId: user.id },
    select: { strategySettings: true },
  });

  const ss = state?.strategySettings as any;

  if (!ss) {
    throw new Error(
      "No strategySettings found on userTradingState for this user"
    );
  }

  return ss as {
    riskUsd: number;
    rr: number;
    maxStopTicks: number;
    entryType: "market" | "limit";
  };
}

export async function startBrokerFeed(emit?: EmitFn): Promise<void> {
  const broker = createBroker();

  const emitSafe = async (event: BrokerEvent) => {
    try {
      await emit?.(event);
    } catch (e) {
      console.error(`[${env.WORKER_NAME}] broker event emit failed`, {
        event,
        err: e,
      });
    }
  };

  console.log(`[${env.WORKER_NAME}] broker starting`, {
    broker: broker.name,
  });

  // Ensure we cleanly close Prisma on shutdown
  const onSig = async (sig: string) => {
    console.log(`[${env.WORKER_NAME}] received ${sig}, shutting down...`);
    await shutdownPrisma();
    process.exit(0);
  };
  process.once("SIGINT", () => void onSig("SIGINT"));
  process.once("SIGTERM", () => void onSig("SIGTERM"));

  try {
    await broker.connect();
    await emitSafe({
      name: "broker.connected",
      ts: new Date().toISOString(),
      broker: broker.name,
    });

    await broker.authorize();
    await emitSafe({
      name: "broker.authorized",
      ts: new Date().toISOString(),
      broker: broker.name,
    });

    if (typeof (broker as any).warmup === "function") {
      await (broker as any).warmup();
    }

    broker.startKeepAlive();

    console.log(`[${env.WORKER_NAME}] broker ready for market data`, {
      broker: broker.name,
    });

    const status =
      typeof (broker as any).getStatus === "function"
        ? (broker as any).getStatus()
        : null;

    await emitSafe({
      name: "broker.ready",
      ts: new Date().toISOString(),
      broker: broker.name,
      data: status ?? undefined,
    });

    // ------------------------------------------------------------------
    // MANUAL EXECUTION LISTENER (DEV ONLY)
    // ------------------------------------------------------------------
    // Allows a one-off manual bracket to be submitted via Ably to prove
    // that Aura can place real orders on the demo account.
    //
    // Guarded by:
    //   MANUAL_EXEC=1
    //   MANUAL_EXEC_TOKEN
    //   AURA_CLERK_USER_ID
    // ------------------------------------------------------------------

    console.log(`[${env.WORKER_NAME}] MANUAL_EXEC_CHECK`, {
      MANUAL_EXEC: process.env.MANUAL_EXEC ?? null,
      manualTokenLen: (process.env.MANUAL_EXEC_TOKEN || "").trim().length,
      expectedUser: (process.env.AURA_CLERK_USER_ID || "").trim(),
    });

    if (process.env.MANUAL_EXEC === "1") {
      const manualToken = (process.env.MANUAL_EXEC_TOKEN || "").trim();
      const expectedUser = (process.env.AURA_CLERK_USER_ID || "").trim();

      if (!manualToken || !expectedUser) {
        console.warn(
          `[${env.WORKER_NAME}] MANUAL_EXEC enabled but token or user missing`,
          {
            hasToken: Boolean(manualToken),
            hasUser: Boolean(expectedUser),
          }
        );
      } else {
        try {
          const ably = createAblyRealtime();

          await new Promise<void>((resolve, reject) => {
            ably.connection.on("connected", () => resolve());
            ably.connection.on("failed", () =>
              reject(new Error("Ably connection failed (manual exec)"))
            );
          });

          const execChannel = ably.channels.get(`aura:exec:${expectedUser}`);

          await execChannel.attach();

          console.log(
            `[${env.WORKER_NAME}] exec channel attached`,
            execChannel.name
          );

          execChannel.subscribe("exec.manual_bracket", async (msg) => {
            console.log(
              `[${env.WORKER_NAME}] exec.manual_bracket RECEIVED`,
              msg.data
            );

            try {
              const p = msg.data as any;

              if (
                !p ||
                typeof p !== "object" ||
                p.token !== manualToken ||
                p.clerkUserId !== expectedUser
              ) {
                console.warn("[manual-exec] rejected payload", p);
                return;
              }

              const ident = await getUserIdentityForWorker();

              const msgId = (msg as any)?.id ? String((msg as any).id) : null;
              const execKey = `manual:${expectedUser}:${msgId ?? Date.now()}`;

              console.log("[manual-exec] REQUEST RECEIVED", {
                execKey,
                contractId: p.contractId,
                side: p.side,
                size: p.size,
                stopLossTicks: p.stopLossTicks,
                takeProfitTicks: p.takeProfitTicks,
                dryRun: DRY_RUN,
              });

              if (DRY_RUN) {
                console.log("[manual-exec] DRY_RUN=true — order not submitted");
                return;
              }

              const row = await executeBracket({
                prisma: getPrisma(),
                broker,
                input: {
                  execKey,
                  userId: ident.userId,
                  brokerName: broker.name,
                  contractId: String(p.contractId),
                  symbol: null,
                  side: p.side === "sell" ? "sell" : "buy",
                  qty: Number(p.size),
                  entryType: "market",
                  stopLossTicks: Number(p.stopLossTicks),
                  takeProfitTicks: Number(p.takeProfitTicks),
                  customTag: `aura-manual-${Date.now()}`,
                },
              });

              console.log("[manual-exec] MANUAL_ORDER_SUBMITTED", {
                execKey,
                executionId: row.id,
              });
            } catch (e) {
              console.error("[manual-exec] FAILED", e);
            }
          });

          console.log(
            `[${env.WORKER_NAME}] manual execution listening (exec.manual_bracket)`
          );
        } catch (e) {
          console.warn(
            `[${env.WORKER_NAME}] manual exec listener failed to start`,
            e
          );
        }
      }
    }

    // --- Strategy engine bootstrap (config single-source-of-truth) ---
    const tickSize = numOrNull(status?.tickSize);
    const tickValue = numOrNull(status?.tickValue);

    let strategy: CorePlus315Engine | null = null;

    if (tickSize && tickValue) {
      strategy = new CorePlus315Engine({ tickSize, tickValue });

      const ss = await getStrategySettingsForWorker();

      strategy.setConfig({
        riskUsd: ss.riskUsd,
        rr: ss.rr,
        maxStopTicks: ss.maxStopTicks,
        entryType: ss.entryType,
      });

      console.log(`[${env.WORKER_NAME}] strategySettings loaded (risk)`, {
        riskUsd: ss.riskUsd,
        rr: ss.rr,
        maxStopTicks: ss.maxStopTicks,
        entryType: ss.entryType,
      });

      strategy.setConfig({
        riskUsd: ss.riskUsd,
        rr: ss.rr,
        maxStopTicks: ss.maxStopTicks,
        entryType: ss.entryType,
      });

      console.log(`[${env.WORKER_NAME}] strategy ready`, {
        name: "coreplus315",
        tickSize,
        tickValue,
        cfg: strategy.getConfig(),
      });

      // Hot-reload per-user risk settings (every few seconds)
      setInterval(() => {
        void (async () => {
          try {
            const ss2 = await getStrategySettingsForWorker();
            const current = strategy!.getConfig();

            const changed =
              current.riskUsd !== ss2.riskUsd ||
              current.rr !== ss2.rr ||
              current.maxStopTicks !== ss2.maxStopTicks ||
              current.entryType !== ss2.entryType;

            if (changed) {
              strategy!.setConfig({
                riskUsd: ss2.riskUsd,
                rr: ss2.rr,
                maxStopTicks: ss2.maxStopTicks,
                entryType: ss2.entryType,
              });

              console.log(`[${env.WORKER_NAME}] strategySettings applied (risk)`, {
                riskUsd: ss2.riskUsd,
                rr: ss2.rr,
                maxStopTicks: ss2.maxStopTicks,
                entryType: ss2.entryType,
              });

              try {
                const db = getPrisma();
                const ident = await getUserIdentityForWorker();

                await db.eventLog.create({
                  data: {
                    type: "config.applied",
                    level: "info",
                    message: "Worker applied updated strategySettings risk config",
                    data: {
                      clerkUserId: ident.clerkUserId,
                      riskUsd: ss2.riskUsd,
                      rr: ss2.rr,
                      maxStopTicks: ss2.maxStopTicks,
                      entryType: ss2.entryType,
                    },
                    userId: ident.userId,
                  },
                });
              } catch {
                // ignore logging failure
              }
            }
          } catch (e) {
            console.warn(
              `[${env.WORKER_NAME}] strategySettings hot-reload failed`,
              e
            );
          }
        })();
      }, 5_000);

      // Replay is ONLY for weekends / debugging.
      // It must NOT run during live trading, otherwise it can mark the active FVG as "traded"
      // and block real entries.
      const enableReplay = process.env.STRATEGY_REPLAY === "1";

      if (enableReplay) {
        const symbol = (process.env.PROJECTX_SYMBOL || "").trim();
        if (symbol) {
          await replayRecentCandlesOnce({
            symbol,
            limit: 600,
            engine: strategy,
          });
        } else {
          console.warn(
            `[${env.WORKER_NAME}] strategy replay skipped (PROJECTX_SYMBOL missing)`
          );
        }
      } else {
        console.log(
          `[${env.WORKER_NAME}] strategy replay disabled (STRATEGY_REPLAY!=1)`
        );
      }
    } else {
      console.warn(
        `[${env.WORKER_NAME}] strategy NOT started (missing tickSize/tickValue)`,
        {
          tickSize,
          tickValue,
        }
      );
    }

    // --- ProjectX market hub ---
    if (broker.name === "projectx") {
      const token =
        typeof (broker as any).getAuthToken === "function"
          ? (broker as any).getAuthToken()
          : null;

      const contractId = process.env.PROJECTX_CONTRACT_ID?.trim() || null;

      if (!token) {
        console.warn("[projectx-market] no token available, market hub not started");
        return;
      }

      if (!contractId) {
        console.warn(
          "[projectx-market] PROJECTX_CONTRACT_ID not set, market hub not started"
        );
        return;
      }

      try {
        // Gate forceClose so it only runs when we are actually seeing live quotes
        let lastLiveQuoteAtMs = 0;
        let rolloverOkLogged = false;

        // Shared handler: persist + strategy + emit for ANY closed 15s candle
        const handleClosed15s = async (params: {
          source: "rollover" | "forceClose";
          closed: { data: any };
        }) => {
          const closed = params.closed;

          // ✅ IMPORTANT (WEEKEND SAFETY):
          // Do NOT persist or trade on force-closed candles (or super-low tick candles).
          // These are synthetic "keep UI alive" candles and should not pollute Candle15s.
          const ticks = Number(closed?.data?.ticks ?? 0);
          // Sunday proof: confirm we are getting REAL rollovers with movement
          if (!rolloverOkLogged && params.source === "rollover" && ticks > 1) {
            rolloverOkLogged = true;
            console.log(
              `[candle15s] ROLLOVER_OK t0=${closed.data.t0} ticks=${ticks} o=${closed.data.o} h=${closed.data.h} l=${closed.data.l} c=${closed.data.c}`
            );
          }
          if (params.source === "forceClose" || ticks <= 1) {
            await emitSafe({
              name: "candle.15s.closed",
              ts: new Date().toISOString(),
              broker: "projectx",
              data: closed.data,
            });
            return;
          }

          // 3a) Persist CLOSED candle
          try {
            const db = getPrisma();
            const symbol =
              (process.env.PROJECTX_SYMBOL || "").trim() || closed.data.contractId;

            const time = Math.floor(closed.data.t0 / 1000);

            await db.candle15s.upsert({
              where: { symbol_time: { symbol, time } },
              create: {
                symbol,
                time,
                open: closed.data.o,
                high: closed.data.h,
                low: closed.data.l,
                close: closed.data.c,
              },
              update: {
                open: closed.data.o,
                high: closed.data.h,
                low: closed.data.l,
                close: closed.data.c,
              },
            });

            // 3b) Run strategy on closed candle (ONLY if enabled, and obey pause/kill switch)
            if (strategyEnabled && strategy) {
              const { isPaused, isKillSwitched } = await getUserTradingState();

              console.log(`[${env.WORKER_NAME}] state on rollover`, {
                isPaused,
                isKillSwitched,
                source: params.source,
                time,
                symbol,
              });

              if (isKillSwitched) {
                console.warn(
                  `[${env.WORKER_NAME}] KILL SWITCH ACTIVE - trading blocked`
                );
                return;
              }

              if (isPaused) {
                console.log(
                  `[${env.WORKER_NAME}] Trading paused - skipping strategy`
                );
                return;
              }

              console.log(`[${env.WORKER_NAME}] Strategy tick (live)`, {
                source: params.source,
                symbol,
                time,
                o: closed.data.o,
                h: closed.data.h,
                l: closed.data.l,
                c: closed.data.c,
                ticks,
              });

              console.log(
                `[${env.WORKER_NAME}] Strategy evaluating candle (live)`,
                {
                  source: params.source,
                  symbol,
                  time,
                  ticks,
                  o: closed.data.o,
                  h: closed.data.h,
                  l: closed.data.l,
                  c: closed.data.c,
                }
              );

              const intent = strategy.ingestClosed15s({
                symbol,
                time,
                open: closed.data.o,
                high: closed.data.h,
                low: closed.data.l,
                close: closed.data.c,
              });

              if (!intent) {
                console.log(`[${env.WORKER_NAME}] No trade this candle (live)`, {
                  source: params.source,
                  symbol,
                  time,
                  ticks,
                  engine: strategy.getDebugState(),
                });
              }

              if (intent) {
                console.log(`[${env.WORKER_NAME}] TRADE_INTENT (live)`, intent);

                const bracket = buildBracketFromIntent(intent);
                console.log(`[${env.WORKER_NAME}] BRACKET (live)`, bracket);

                // Emit bracket intent (UI / audit)
                await emitSafe({
                  name: "exec.bracket",
                  ts: new Date().toISOString(),
                  broker: "projectx",
                  data: {
                    source: params.source,
                    bracket,
                  },
                });

                // ✅ EXECUTION (only when DRY_RUN=false and only on real rollover candles)
                try {
                  if (!DRY_RUN && params.source === "rollover") {
                    const placeFn = (broker as any).placeOrderWithBrackets;

                    if (typeof placeFn !== "function") {
                      console.warn("[exec] broker missing placeOrderWithBrackets");
                    } else {
                      const contractIdFromBracket = String(
                        (bracket as any).contractId || (bracket as any).symbol || ""
                      ).trim();

                      const side =
                        String((bracket as any).side || "").toLowerCase() === "sell"
                          ? "sell"
                          : "buy";

                      const size = Number((bracket as any).qty ?? 1);

                      const stopLossTicks =
                        (bracket as any)?.meta?.stopTicks != null
                          ? Number((bracket as any).meta.stopTicks)
                          : null;

                      const takeProfitTicks =
                        (bracket as any)?.meta?.tpTicks != null
                          ? Number((bracket as any).meta.tpTicks)
                          : null;

                      if (!contractIdFromBracket) {
                        console.warn("[exec] missing contractId on bracket", bracket);
                      } else {
                        const res = await placeFn.call(broker, {
                          contractId: contractIdFromBracket,
                          side,
                          size,
                          type: "market",
                          stopLossTicks,
                          takeProfitTicks,
                          customTag: `aura-coreplus315-${Date.now()}`,
                        });

                        console.log("[exec] ORDER_SUBMITTED", {
                          orderId: res?.orderId ?? null,
                          contractId: contractIdFromBracket,
                          side,
                          size,
                          stopLossTicks,
                          takeProfitTicks,
                        });

                        // Persist exec audit trail
                        try {
                          const ident = await getUserIdentityForWorker();

                          await db.eventLog.create({
                            data: {
                              type: "exec.submitted",
                              level: "info",
                              message: "Order submitted via ProjectX",
                              data: {
                                clerkUserId: ident.clerkUserId,
                                orderId: res?.orderId ?? null,
                                contractId: contractIdFromBracket,
                                side,
                                size,
                                stopLossTicks,
                                takeProfitTicks,
                                bracket,
                              },
                              userId: ident.userId,
                            },
                          });
                        } catch (e) {
                          console.warn(
                            "[exec] failed to write exec.submitted eventLog",
                            e
                          );
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.error("[exec] placeOrderWithBrackets failed", e);
                  try {
                    const ident = await getUserIdentityForWorker();

                    await db.eventLog.create({
                      data: {
                        type: "exec.failed",
                        level: "error",
                        message: "placeOrderWithBrackets failed",
                        data: {
                          clerkUserId: ident.clerkUserId,
                          error: e instanceof Error ? e.message : String(e),
                          bracket,
                        },
                        userId: ident.userId,
                      },
                    });
                  } catch {
                    // ignore
                  }
                }
              }
            }
          } catch (e) {
            console.error("[projectx-market] failed to persist Candle15s / run strategy", e);
          }

          // 3c) Emit candle close event
          await emitSafe({
            name: "candle.15s.closed",
            ts: new Date().toISOString(),
            broker: "projectx",
            data: closed.data,
          });
        };

        const externalAccountId = String(status?.accountId ?? "");
        const strategyEnabled = externalAccountId
          ? await getStrategyEnabledForAccount({
              brokerName: "projectx",
              externalAccountId,
            })
          : true;

        console.log(`[${env.WORKER_NAME}] strategy toggle`, {
          broker: "projectx",
          externalAccountId: externalAccountId || null,
          enabled: strategyEnabled,
          note:
            "Set SystemState key strategy.enabled:projectx:<accountId> to false to disable.",
        });

        const marketHub = new ProjectXMarketHub({
          token,
          contractId,
          raw: true,
          debugInvocations: true,
          onQuote: async (q) => {
            // Used to gate forceClose so we never fabricate candles when the market is closed
            // IMPORTANT: only treat quotes as "live" if they are fresh (not old snapshot data).
            const tsMs = q.ts ? Date.parse(q.ts) : NaN;
            const ageMs = Number.isFinite(tsMs) ? Date.now() - tsMs : null;

            // If ts is missing, don't assume it's live.
            // If ts exists, require it to be reasonably fresh.
            const LIVE_QUOTE_MAX_AGE_MS = 15_000; // 15s (safe for 15s candle building)
            if (ageMs !== null && ageMs <= LIVE_QUOTE_MAX_AGE_MS) {
              lastLiveQuoteAtMs = Date.now();
            }

            // 1) Persist quote snapshot (THROTTLED)
            try {
              const instrumentKey = q.contractId;
              const now = Date.now();
              const last = lastPersistAtByInstrument.get(instrumentKey) ?? 0;

              if (now - last >= PERSIST_EVERY_MS) {
                lastPersistAtByInstrument.set(instrumentKey, now);

                const db = getPrisma();

                const ident = await getUserIdentityForWorker();

                await db.eventLog.create({
                  data: {
                    type: "market.quote",
                    level: "info",
                    message: "ProjectX quote",
                    data: {
                      clerkUserId: ident.clerkUserId,
                      broker: "projectx",
                      contractId: q.contractId,
                      bid: q.bid ?? null,
                      ask: q.ask ?? null,
                      last: q.last ?? null,
                      ts: q.ts ?? null,
                    },
                    userId: ident.userId,
                  },
                });
              }
            } catch (e) {
              console.error("[projectx-market] failed to persist quote", e);
            }

            // 2) Emit quote event
            await emitSafe({
              name: "broker.market.quote",
              ts: new Date().toISOString(),
              broker: "projectx",
              data: {
                contractId: q.contractId,
                bid: q.bid,
                ask: q.ask,
                last: q.last ?? null,
                ts: q.ts ?? null,
              },
            });

            // If we have no price, we can't build candles.
            if (q.last == null && q.bid == null && q.ask == null) return;

            // 3) Build 15s candle from quote stream
            const closed = candle15s.ingest(
              {
                contractId: q.contractId,
                bid: q.bid,
                ask: q.ask,
                last: q.last ?? null,
                ts: q.ts ?? null,
              },
              Date.now()
            );

            if (closed) {
              await handleClosed15s({ source: "rollover", closed });
            }
          },
        });

        await marketHub.start();

        // --- quote stream watchdog (prove we're truly live, not just a snapshot) ---
        try {
          const live = await marketHub.waitForLiveQuotes({
            minQuotes: 5,
            withinMs: 10_000,
          });

          const s = marketHub.getQuoteStats();

          if (live) {
            console.log(
              `[quotes] QUOTE_STREAM_OK count=${s.quoteCount} firstAt=${s.firstQuoteAtMs} lastAt=${s.lastQuoteAtMs}`
            );
          } else {
            console.warn(
              `[quotes] QUOTE_STREAM_NOT_LIVE count=${s.quoteCount} (snapshot only? market closed? connection issue)`
            );
          }
        } catch (e) {
          console.warn("[quotes] watchdog failed (non-fatal)", e);
        }

        // Weekend/quiet-market:
        // Only force-close if we have seen a quote recently.
        // This prevents “one stale snapshot then endless fabricated candles”.
        setInterval(() => {
          void (async () => {
            try {
              const now = Date.now();
              const activeWindowMs = 30_000;

              if (!lastLiveQuoteAtMs || now - lastLiveQuoteAtMs > activeWindowMs) {
                return;
              }

              const forced = candle15s.forceCloseIfDue(now);
              if (!forced) return;

              await handleClosed15s({ source: "forceClose", closed: forced });
            } catch (e) {
              console.error("[projectx-market] forceCloseIfDue failed", e);
            }
          })();
        }, 1000);

        console.log("[projectx-market] started", {
          accountId: status?.accountId ?? null,
          contractId,
        });
      } catch (e) {
        console.error("[projectx-market] failed to start", e);
      }
    }
  } catch (e) {
    await emitSafe({
      name: "broker.error",
      ts: new Date().toISOString(),
      broker: broker.name,
      data: { message: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
