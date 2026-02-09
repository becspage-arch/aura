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

console.log("[startBrokerFeed.ts] LOADED", {
  MANUAL_EXEC: process.env.MANUAL_EXEC ?? null,
  hasManualToken: Boolean((process.env.MANUAL_EXEC_TOKEN || "").trim()),
  AURA_CLERK_USER_ID: process.env.AURA_CLERK_USER_ID ?? null,
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

// --- user trading state guard (pause / kill switch) ---
let cachedUserTradingState:
  | { isPaused: boolean; isKillSwitched: boolean }
  | null = null;

let lastUserTradingStateCheck = 0;
const USER_STATE_REFRESH_MS = 5_000;

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

export async function startBrokerFeed(params?: {
  emitSafe?: EmitFn;
  onBrokerReady?: (broker: IBrokerAdapter) => void;
}): Promise<void> {
  const broker = createBroker();

  const emitSafe = async (event: BrokerEvent) => {
    try {
      await params?.emitSafe?.(event);
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

    // IMPORTANT: hand the live broker instance back to index.ts for Ably exec
    try {
      params?.onBrokerReady?.(broker as unknown as IBrokerAdapter);
    } catch (e) {
      console.warn(`[${env.WORKER_NAME}] onBrokerReady callback failed`, e);
    }

    // ------------------------------------------------------------------
    // MANUAL EXECUTION LISTENER (DEV ONLY)
    // ------------------------------------------------------------------
    console.log(`[${env.WORKER_NAME}] MANUAL_EXEC_CHECK`, {
      MANUAL_EXEC: process.env.MANUAL_EXEC ?? null,
      manualTokenLen: (process.env.MANUAL_EXEC_TOKEN || "").trim().length,
      expectedUser: (process.env.AURA_CLERK_USER_ID || "").trim(),
    });

    await startManualExecListener({
      env,
      DRY_RUN,
      broker,
      getPrisma,
      getUserIdentityForWorker,
      enabled: process.env.MANUAL_EXEC === "1",
      manualToken: (process.env.MANUAL_EXEC_TOKEN || "").trim(),
      expectedUser: (process.env.AURA_CLERK_USER_ID || "").trim(),
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
        console.warn(
          "[projectx-market] no token available, market hub not started"
        );
        return;
      }

      if (!contractId) {
        console.warn(
          "[projectx-market] PROJECTX_CONTRACT_ID not set, market hub not started"
        );
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
