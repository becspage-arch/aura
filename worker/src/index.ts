// worker/src/index.ts

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
  console.log(`[${env.WORKER_NAME}] BUILD`, {
    ts: new Date().toISOString(),
    gitSha: process.env.GIT_SHA ?? null,
  });

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

  // 3) Required environment
  const expectedClerkUserId = (process.env.AURA_CLERK_USER_ID || "").trim();
  if (!expectedClerkUserId) {
    throw new Error(`[${env.WORKER_NAME}] Missing AURA_CLERK_USER_ID`);
  }

  const brokerAccountId = (process.env.AURA_BROKER_ACCOUNT_ID || "").trim();
  if (!brokerAccountId) {
    throw new Error(`[${env.WORKER_NAME}] Missing AURA_BROKER_ACCOUNT_ID`);
  }

  // 4) Connect to Ably
  const ably = createAblyRealtime();
  await new Promise<void>((resolve, reject) => {
    ably.connection.on("connected", () => resolve());
    ably.connection.on("failed", () => reject(new Error("Ably connection failed")));
  });
  console.log(`[${env.WORKER_NAME}] Ably connected`);

  const uiChannel = ably.channels.get(`aura:ui:${expectedClerkUserId}`);
  const brokerChannel = ably.channels.get(`aura:broker:${expectedClerkUserId}`);

  // 4b) Daily summary scheduler
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

  // 5) Resolve internal userProfile id
  const user = await db.userProfile.findUnique({
    where: { clerkUserId: expectedClerkUserId },
    select: { id: true },
  });

  if (!user?.id) {
    throw new Error(
      `[${env.WORKER_NAME}] No userProfile found for clerkUserId=${expectedClerkUserId}`
    );
  }

  const userId = user.id;

  // 5b) Verify broker account ownership
  const acct = await db.brokerAccount.findFirst({
    where: { id: brokerAccountId, userId },
    select: { id: true, brokerName: true, externalId: true },
  });

  if (!acct) {
    throw new Error(
      `[${env.WORKER_NAME}] BrokerAccount not found or not owned by user. brokerAccountId=${brokerAccountId}`
    );
  }

  console.log(`[${env.WORKER_NAME}] broker account scope`, acct);

  // 5c) Heartbeat loop (updates BrokerAccount.lastHeartbeatAt)
  const heartbeatEveryMs = 15_000;

  const heartbeatInterval = setInterval(() => {
    void db.brokerAccount
      .update({
        where: { id: brokerAccountId },
        data: { lastHeartbeatAt: new Date() },
        select: { id: true },
      })
      .catch((e) => {
        console.warn(
          `[${env.WORKER_NAME}] heartbeat failed brokerAccountId=${brokerAccountId} error=${
            e instanceof Error ? `${e.name}: ${e.message}` : String(e)
          }`
        );
      });
  }, heartbeatEveryMs);

  const cleanupHeartbeat = () => clearInterval(heartbeatInterval);
  process.once("SIGINT", cleanupHeartbeat);
  process.once("SIGTERM", cleanupHeartbeat);

  // 5d) Worker uptime heartbeat (writes EventLog once per minute)
  const workerHeartbeatEveryMs = 60_000;

  const writeWorkerHeartbeat = async () => {
    try {
      await db.eventLog.create({
        data: {
          type: "worker_heartbeat",
          level: "info",
          message: "worker heartbeat",
          data: {
            workerName: env.WORKER_NAME,
            workerEnv: env.WORKER_ENV,
            dryRun: DRY_RUN,
          },
          userId: userId,
          brokerAccountId: brokerAccountId,
        },
        select: { id: true },
      });
    } catch (e) {
      console.warn(`[${env.WORKER_NAME}] worker_heartbeat write failed`, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // write immediately, then every minute
  await writeWorkerHeartbeat();
  const workerHeartbeatInterval = setInterval(() => {
    void writeWorkerHeartbeat();
  }, workerHeartbeatEveryMs);

  const cleanupWorkerHeartbeat = () => clearInterval(workerHeartbeatInterval);
  process.once("SIGINT", cleanupWorkerHeartbeat);
  process.once("SIGTERM", cleanupWorkerHeartbeat);

  // 6) Exec listener
  const ablyKey = (process.env.ABLY_API_KEY || "").trim();
  if (!ablyKey) {
    throw new Error(`[${env.WORKER_NAME}] Missing ABLY_API_KEY`);
  }

  let brokerRef: IBrokerAdapter | null = null;

  await startAblyExecListener({
    ablyApiKey: ablyKey,
    clerkUserId: expectedClerkUserId,
    log: (msg, extra) => console.log(msg, extra ?? ""),
    placeManualBracket: async (p) => {
      if (!brokerRef) {
        throw new Error("Broker not ready yet (brokerRef is null)");
      }

      const execKey = `manual:${expectedClerkUserId}:${Date.now()}`;

      await executeBracket({
        prisma: db,
        broker: brokerRef,
        input: {
          execKey,
          userId,
          brokerName: (brokerRef as any)?.name ?? "projectx",
          contractId: p.contractId,
          side: p.side,
          qty: p.size,
          entryType: "market",
          stopLossTicks: p.stopLossTicks,
          takeProfitTicks: p.takeProfitTicks,
          customTag: null,
        },
      });
    },
  });

  // 7) Start broker feed
  try {
    await startBrokerFeed({
      onBrokerReady: async (b) => {
        brokerRef = b;

        console.log(`[${env.WORKER_NAME}] broker ready for exec`, {
          name: (b as any)?.name ?? null,
        });

        const { resumeOpenExecutions } = await import(
          "./execution/resumeOpenExecutions.js"
        );

        await resumeOpenExecutions({
          prisma: db,
          broker: b,
          userId,
        });
      },
      emitSafe: async (event) => {
        await brokerChannel.publish(event.name, event);

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
