import { env, DRY_RUN } from "./env.js";
import { db, checkDb } from "./db.js";
import { createAblyRealtime } from "./ably.js";
import { acquireLock, refreshLock, releaseLock } from "./locks.js";
import { randomUUID } from "crypto";
import { startBrokerFeed } from "./broker/startBrokerFeed.js";
import { startDailyScheduler } from "./notifications/dailyScheduler.js";
import { startAblyExecListener } from "./exec/ablyExecListener.js";
import { executeBracket } from "./execution/executeBracket.js";
import type { IBrokerAdapter } from "./broker/IBrokerAdapter.js";

async function main() {
  console.log(`[${env.WORKER_NAME}] boot`, {
    env: env.WORKER_ENV,
    dryRun: DRY_RUN,
  });

  // 1) DB bootstrap check
  await checkDb();
  console.log(`[${env.WORKER_NAME}] DB connected`);

  // 2) Acquire worker lock (single active worker)
  const lockKey = `workerLock:${env.WORKER_NAME}`;
  const lockTtlMs = 60_000;
  const lockOwnerId = randomUUID();

  const ok = await acquireLock(lockKey, lockTtlMs, lockOwnerId);
  if (!ok) {
    console.log(`[${env.WORKER_NAME}] lock already held, exiting`);
    process.exit(0);
  }

  const refreshEveryMs = Math.floor(lockTtlMs / 2);
  const lockInterval = setInterval(() => {
    void refreshLock(lockKey, lockTtlMs, lockOwnerId).catch((e) => {
      console.warn(`[${env.WORKER_NAME}] lock refresh failed`, e);
    });
  }, refreshEveryMs);

  const cleanupLock = async () => {
    clearInterval(lockInterval);
    try {
      await releaseLock(lockKey, lockOwnerId);
    } catch (e) {
      console.warn(`[${env.WORKER_NAME}] lock release failed`, e);
    }
  };

  process.once("SIGINT", () => void cleanupLock().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void cleanupLock().finally(() => process.exit(0)));

  // 3) Expected user id for this worker
  const expectedClerkUserId = (process.env.AURA_CLERK_USER_ID || "").trim();
  if (!expectedClerkUserId) {
    throw new Error(`[${env.WORKER_NAME}] Missing AURA_CLERK_USER_ID`);
  }

  // 4) Connect to Ably (lifecycle + broker + exec)
  const ably = createAblyRealtime();
  await new Promise<void>((resolve, reject) => {
    ably.connection.on("connected", () => resolve());
    ably.connection.on("failed", () => reject(new Error("Ably connection failed")));
  });
  console.log(`[${env.WORKER_NAME}] Ably connected`);

  const uiChannel = ably.channels.get(`aura:ui:${expectedClerkUserId}`);
  const brokerChannel = ably.channels.get(`aura:broker:${expectedClerkUserId}`);

  // 4b) Start daily summary scheduler (Phase 1 completion)
  startDailyScheduler({
    tz: "Europe/London",
    onRun: async () => {
      const { emitDailySummary } = await import("./notifications/emitDailySummary.js");
      await emitDailySummary({
        prisma: db,
        clerkUserId: expectedClerkUserId,
      });
    },
  });

  // 5) Wire Ably exec listener → executeBracket()
  const ablyKey = (process.env.ABLY_API_KEY || "").trim();
  if (!ablyKey) {
    throw new Error(`[${env.WORKER_NAME}] Missing ABLY_API_KEY`);
  }

  let brokerRef: IBrokerAdapter | null = null;

  await startAblyExecListener({
    ablyApiKey: ablyKey,
    log: (msg, extra) => console.log(msg, extra ?? ""),
    placeManualBracket: async (p) => {
      if (!brokerRef) {
        throw new Error("Broker not ready yet (brokerRef is null)");
      }

      const execKey = `manual:${expectedClerkUserId}:${Date.now()}:${p.contractId}:${p.side}:${p.size}:${p.stopLossTicks}:${p.takeProfitTicks}`;

      await executeBracket({
        prisma: db,
        broker: brokerRef,
        input: {
          execKey,
          userId: expectedClerkUserId,
          brokerName: (brokerRef as any)?.name ?? "projectx",
          contractId: p.contractId,
          side: p.side,
          qty: p.size,
          entryType: "market",
          stopLossTicks: p.stopLossTicks,
          takeProfitTicks: p.takeProfitTicks,
          customTag: "manual",
        },
      });
    },
  });

  // 6) Start broker feed (and capture broker instance when ready)
  try {
  await startBrokerFeed({
    onBrokerReady: (b) => {
      brokerRef = b;
      console.log(`[${env.WORKER_NAME}] broker ready for exec`, {
        name: (b as any)?.name ?? null,
      });
    },
    emitSafe: async (event) => {
      await brokerChannel.publish(event.name, event);

      if (event.name === "candle.15s.closed" && event.data) {
        const d: any = event.data;

        await uiChannel.publish("aura", {
          type: "candle_closed",
          ts: event.ts,
          data: {
            symbol: String(d.contractId),
            timeframe: "15s",
            time: Math.floor(Number(d.t0) / 1000),
            open: Number(d.o),
            high: Number(d.h),
            low: Number(d.l),
            close: Number(d.c),
          },
        });
      }

      console.log(`[${env.WORKER_NAME}] published broker event`, {
        name: event.name,
        broker: event.broker,
      });
    },
  });

  } catch (e) {
    console.error(`[${env.WORKER_NAME}] broker start failed`, e);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("worker crash", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
