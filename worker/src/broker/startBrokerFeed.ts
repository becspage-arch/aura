// worker/src/broker/startBrokerFeed.ts
import { env, DRY_RUN } from "../env.js";
import { PrismaClient } from "@prisma/client";
import { createBroker } from "./createBroker.js";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { startManualExecListener } from "./manualExecListener.js";
import { startProjectXMarketFeed } from "./projectx/startProjectXMarketFeed.js";
import { bootstrapStrategy } from "../strategy/bootstrapStrategy.js";
import { startProjectXUserFeed } from "./projectx/startProjectXUserFeed.js";
import type { IBrokerAdapter } from "./IBrokerAdapter.js";
import type { WorkerScope } from "../scope/workerScope.js";

console.log("[startBrokerFeed.ts] LOADED", {
  MANUAL_EXEC: process.env.MANUAL_EXEC ?? null,
  hasManualToken: Boolean((process.env.MANUAL_EXEC_TOKEN || "").trim()),
  AURA_CLERK_USER_ID: process.env.AURA_CLERK_USER_ID ?? null,
  AURA_BROKER_ACCOUNT_ID: process.env.AURA_BROKER_ACCOUNT_ID ?? null,
});

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

const db = getPrisma();
const r = await db.$queryRawUnsafe<any[]>(
  `select current_database() as db, current_schema() as schema, now() as now`
);
console.log(`[${env.WORKER_NAME}] DB_IDENTITY`, r?.[0] ?? null);

// --- user trading state guard (pause / kill switch) ---
let cachedUserTradingState:
  | { isPaused: boolean; isKillSwitched: boolean }
  | null = null;

let lastUserTradingStateCheck = 0;
const USER_STATE_REFRESH_MS = 5_000;

// --- debug: log pause/kill changes even when markets are closed ---
let lastLoggedUserState: { isPaused: boolean; isKillSwitched: boolean } | null =
  null;

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

export async function startBrokerFeed(params: {
  scope: WorkerScope;
  emitSafe?: EmitFn;
  onBrokerReady?: (broker: IBrokerAdapter) => void;
}): Promise<void> {
  const scope = params.scope;
  if (!scope?.clerkUserId || !scope?.userId || !scope?.brokerAccountId) {
    throw new Error(
      `[${env.WORKER_NAME}] startBrokerFeed missing scope (8M.7.1)`
    );
  }

  const userStateWatchInterval = setInterval(() => {
    void (async () => {
      try {
        if (process.env.DEBUG_USER_STATE !== "1") return;

        const s = await getUserTradingState();

        if (
          !lastLoggedUserState ||
          s.isPaused !== lastLoggedUserState.isPaused ||
          s.isKillSwitched !== lastLoggedUserState.isKillSwitched
        ) {
          console.log(`[${env.WORKER_NAME}] user trading state`, {
            clerkUserId: scope.clerkUserId,
            ...s,
          });
          lastLoggedUserState = s;
        }
      } catch (e) {
        console.warn(`[${env.WORKER_NAME}] user state watcher failed`, e);
      }
    })();
  }, 5_000);

  process.once("SIGINT", () => clearInterval(userStateWatchInterval));
  process.once("SIGTERM", () => clearInterval(userStateWatchInterval));

  async function getUserTradingState(): Promise<{
    isPaused: boolean;
    isKillSwitched: boolean;
  }> {
    const now = Date.now();
    if (cachedUserTradingState && now - lastUserTradingStateCheck < USER_STATE_REFRESH_MS) {
      return cachedUserTradingState;
    }

    const db = getPrisma();
    // use startBrokerFeed's scope (source of truth)

    // Per-account gates (PRIMARY)
    const acct = await db.brokerAccount.findUnique({
      where: { id: scope.brokerAccountId },
      select: { isPaused: true, isKillSwitched: true },
    });

    // Optional global gates (SECONDARY / “pause everything”)
    const userState = await db.userTradingState.findUnique({
      where: { userId: scope.userId },
      select: { isPaused: true, isKillSwitched: true },
    });

    const state = {
      isPaused: Boolean(acct?.isPaused) || Boolean(userState?.isPaused),
      isKillSwitched: Boolean(acct?.isKillSwitched) || Boolean(userState?.isKillSwitched),
    };

    cachedUserTradingState = state;
    lastUserTradingStateCheck = now;

    return state;
  }

  async function getStrategyEnabledForAccount(p: {
    brokerName: string;
    externalAccountId: string;
  }): Promise<boolean> {
    const db = getPrisma();

    // NEW (8M.7.2): prefer brokerAccountId scoping
    const keyV2 = `strategy.enabled:${p.brokerName}:${scope.brokerAccountId}`;
    const rowV2 = await db.systemState.findUnique({ where: { key: keyV2 } });

    if (rowV2) {
      const v: any = rowV2.value;
      if (typeof v === "boolean") return v;
      if (v && typeof v.enabled === "boolean") return v.enabled;
      return true;
    }

    // BACKWARDS COMPAT (old key used external account id)
    const keyV1 = `strategy.enabled:${p.brokerName}:${p.externalAccountId}`;
    const rowV1 = await db.systemState.findUnique({ where: { key: keyV1 } });

    // Default = enabled (backwards compatible)
    if (!rowV1) return true;

    const v: any = rowV1.value;
    if (typeof v === "boolean") return v;
    if (v && typeof v.enabled === "boolean") return v.enabled;

    return true;
  }

  async function getUserIdentityForWorker(): Promise<{
    clerkUserId: string;
    userId: string;
    brokerAccountId: string;
  }> {
    return {
      clerkUserId: scope.clerkUserId,
      userId: scope.userId,
      brokerAccountId: scope.brokerAccountId,
    };
  }

  async function getStrategySettingsForWorker(): Promise<{
    riskUsd: number;
    rr: number;
    maxStopTicks: number;
    entryType: "market" | "limit";
    sessions: { asia: boolean; london: boolean; ny: boolean };
  }> {
    const db = getPrisma();

    // 1) Preferred: BrokerAccount.config (per-account)
    const acct = await db.brokerAccount.findUnique({
      where: { id: scope.brokerAccountId },
      select: { config: true },
    });

    const cfg = (acct as any)?.config ?? null;

    // normalize sessions from cfg if present
    const sessionsFromCfgRaw = cfg?.sessions ?? null;
    const sessionsFromCfg = sessionsFromCfgRaw
      ? {
          asia: Boolean(sessionsFromCfgRaw?.asia),
          london: Boolean(sessionsFromCfgRaw?.london),
          ny: Boolean(sessionsFromCfgRaw?.ny),
        }
      : null;

    // if cfg has sessions but none selected => treat as "All Hours"
    const cfgNoneSelected =
      sessionsFromCfg != null &&
      !sessionsFromCfg.asia &&
      !sessionsFromCfg.london &&
      !sessionsFromCfg.ny;

    if (cfg) {
      return {
        riskUsd: Number(cfg?.riskUsd ?? 200),
        rr: Number(cfg?.rr ?? 2),
        maxStopTicks: Number(cfg?.maxStopTicks ?? 45),
        entryType: (cfg?.entryType === "limit" ? "limit" : "market") as "market" | "limit",
        sessions:
          sessionsFromCfg == null
            ? { asia: false, london: false, ny: false }
            : cfgNoneSelected
              ? { asia: false, london: false, ny: false }
              : sessionsFromCfg,
      };
    }

    // 2) Fallback (temporary backwards compatibility): UserTradingState.strategySettings
    const state = await db.userTradingState.findUnique({
      where: { userId: scope.userId },
      select: { strategySettings: true },
    });

    const ss = state?.strategySettings as any;

    if (!ss) {
      // still safe defaults if both missing
      return {
        riskUsd: 200,
        rr: 2,
        maxStopTicks: 45,
        entryType: "market",
        sessions: { asia: false, london: false, ny: false },
      };
    }

    const sessionsRaw = ss?.sessions ?? null;
    const sessions = {
      asia: Boolean(sessionsRaw?.asia),
      london: Boolean(sessionsRaw?.london),
      ny: Boolean(sessionsRaw?.ny),
    };

    // "All Hours" mode = none selected (no restriction)
    const noneSelected = !sessions.asia && !sessions.london && !sessions.ny;

    return {
      riskUsd: Number(ss?.riskUsd ?? 200),
      rr: Number(ss?.rr ?? 2),
      maxStopTicks: Number(ss?.maxStopTicks ?? 45),
      entryType: (ss?.entryType === "limit" ? "limit" : "market") as "market" | "limit",
      sessions: noneSelected ? { asia: false, london: false, ny: false } : sessions,
    };
  }

  const broker = createBroker();

  const emitSafe = async (event: BrokerEvent) => {
    try {
      await params.emitSafe?.(event);
    } catch (e) {
      console.error(`[${env.WORKER_NAME}] broker event emit failed`, {
        event,
        err: e,
      });
    }
  };

  console.log(`[${env.WORKER_NAME}] broker starting`, {
    broker: broker.name,
    scope: {
      clerkUserId: scope.clerkUserId,
      brokerAccountId: scope.brokerAccountId,
      brokerName: scope.brokerName,
      externalId: scope.externalId,
    },
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

    // IMPORTANT: hand the live broker instance back to index.ts for Ably exec
    try {
      params.onBrokerReady?.(broker as unknown as IBrokerAdapter);
    } catch (e) {
      console.warn(`[${env.WORKER_NAME}] onBrokerReady callback failed`, e);
    }

    // ------------------------------------------------------------------
    // MANUAL EXECUTION LISTENER (DEV ONLY)
    // ------------------------------------------------------------------
    console.log(`[${env.WORKER_NAME}] MANUAL_EXEC_CHECK`, {
      MANUAL_EXEC: process.env.MANUAL_EXEC ?? null,
      manualTokenLen: (process.env.MANUAL_EXEC_TOKEN || "").trim().length,
      expectedUser: scope.clerkUserId,
    });

    await startManualExecListener({
      env,
      DRY_RUN,
      broker,
      getPrisma,
      getUserIdentityForWorker,
      enabled: process.env.MANUAL_EXEC === "1",
      manualToken: (process.env.MANUAL_EXEC_TOKEN || "").trim(),
      expectedUser: scope.clerkUserId,
    });

    const { strategy } = await bootstrapStrategy({
      env,
      getPrisma,
      status,
      getStrategySettingsForWorker,
    });

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
        console.warn("[projectx-market] PROJECTX_CONTRACT_ID not set, market hub not started");
        return;
      }

      // --- ProjectX user hub (orders/fills/positions) ---
      try {
        await startProjectXUserFeed({
          env,
          DRY_RUN,
          getPrisma,
          getUserIdentityForWorker,
          token,
          accountId: status?.accountId ?? null,
        });
      } catch (e) {
        console.error("[projectx-user] failed to start", e);
      }

      try {
        await startProjectXMarketFeed({
          env,
          DRY_RUN,
          broker,
          status,
          getPrisma,
          emitSafe,
          getUserTradingState,
          getUserIdentityForWorker,
          getStrategySettingsForWorker,
          getStrategyEnabledForAccount,
          strategy,
          token,
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
