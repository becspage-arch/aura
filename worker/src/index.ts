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

  // 2) Acquire worker lock (single active worker process by WORKER_NAME)
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

  // 3) Required environment
  const expectedClerkUserId = (process.env.AURA_CLERK_USER_ID || "").trim();
  if (!expectedClerkUserId) {
    throw new Error(`[${env.WORKER_NAME}] Missing AURA_CLERK_USER_ID`);
  }

  const brokerAccountId = (process.env.AURA_BROKER_ACCOUNT_ID || "").trim();
  if (!brokerAccountId) {
    throw new Error(`[${env.WORKER_NAME}] Missing AURA_BROKER_ACCOUNT_ID`);
  }

  const instanceId =
    (process.env.WORKER_INSTANCE_ID || "").trim() || `${env.WORKER_NAME}:${randomUUID()}`;

  // ---- shutdown helpers (defined BEFORE we register handlers) ----

  const markLeaseStoppedSafe = async () => {
    try {
      await db.workerLease.update({
        where: { brokerAccountId },
        data: { status: "STOPPED", lastSeenAt: new Date() },
        select: { id: true },
      });
    } catch {
      // ignore
    }
  };

  async function shutdown(code: number) {
    try {
      await markLeaseStoppedSafe();
    } catch {}
    try {
      await cleanupLock();
    } catch {}
    process.exit(code);
  }

  process.once("SIGINT", () => void shutdown(0));
  process.once("SIGTERM", () => void shutdown(0));

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

  // 5c) Claim/renew WorkerLease (single-worker per broker account)
  const leaseTtlMs = 60_000; // consider dead if not seen in 60s
  const now = new Date();

  const existingLease = await db.workerLease.findUnique({
    where: { brokerAccountId },
    select: { instanceId: true, lastSeenAt: true },
  });

  if (existingLease && existingLease.instanceId !== instanceId) {
    const ageMs = now.getTime() - new Date(existingLease.lastSeenAt).getTime();
    if (ageMs < leaseTtlMs) {
      console.log(`[${env.WORKER_NAME}] lease held by another instance - exiting`, {
        brokerAccountId,
        currentInstanceId: existingLease.instanceId,
        thisInstanceId: instanceId,
        lastSeenAt: existingLease.lastSeenAt,
        ageMs,
      });
      process.exit(0);
    }
  }

  await db.workerLease.upsert({
    where: { brokerAccountId },
    create: {
      brokerAccountId,
      instanceId,
      startedAt: now,
      lastSeenAt: now,
      status: "RUNNING",
      workerName: env.WORKER_NAME,
      workerEnv: env.WORKER_ENV,
      meta: { dryRun: DRY_RUN },
    },
    update: {
      instanceId,
      startedAt: now,
      lastSeenAt: now,
      status: "RUNNING",
      workerName: env.WORKER_NAME,
      workerEnv: env.WORKER_ENV,
      meta: { dryRun: DRY_RUN },
    },
    select: { id: true },
  });

  console.log(`[${env.WORKER_NAME}] lease claimed`, { brokerAccountId, instanceId });

  // 5d) Heartbeat loop (updates BrokerAccount.lastHeartbeatAt + WorkerLease.lastSeenAt)
  const heartbeatEveryMs = 15_000;

  const heartbeatInterval = setInterval(() => {
    const ts = new Date();

    void db
      .$transaction([
        db.brokerAccount.update({
          where: { id: brokerAccountId },
          data: { lastHeartbeatAt: ts },
          select: { id: true },
        }),
        db.workerLease.update({
          where: { brokerAccountId },
          data: { lastSeenAt: ts, status: "RUNNING" },
          select: { id: true },
        }),
      ])
      .catch((e) => {
        console.warn(`[${env.WORKER_NAME}] heartbeat failed`, {
          brokerAccountId,
          instanceId,
          name: e?.name ?? null,
          message: e?.message ?? String(e),
          stack: e?.stack ?? null,
        });
      });
  }, heartbeatEveryMs);

  // stop intervals on shutdown signals (in addition to shutdown())
  process.once("SIGINT", () => clearInterval(heartbeatInterval));
  process.once("SIGTERM", () => clearInterval(heartbeatInterval));

  // 5e) Worker uptime heartbeat (writes EventLog once per minute)
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

  await writeWorkerHeartbeat();
  const workerHeartbeatInterval = setInterval(() => {
    void writeWorkerHeartbeat();
  }, workerHeartbeatEveryMs);

  process.once("SIGINT", () => clearInterval(workerHeartbeatInterval));
  process.once("SIGTERM", () => clearInterval(workerHeartbeatInterval));

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
          userId, // internal userProfile id
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

        const { resumeOpenExecutions } = await import("./execution/resumeOpenExecutions.js");

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
  