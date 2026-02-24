// worker/src/index.ts

import { env, DRY_RUN } from "./env.js";
import { db, checkDb } from "./db.js";
import { createAblyRealtime } from "./ably.js";
import { randomUUID } from "crypto";
import { startBrokerFeed } from "./broker/startBrokerFeed.js";
import { startDailyScheduler } from "./notifications/dailyScheduler.js";
import { startAblyExecListener } from "./exec/ablyExecListener.js";
import { executeBracket } from "./execution/executeBracket.js";
import type { IBrokerAdapter } from "./broker/IBrokerAdapter.js";
import { getWorkerScope } from "./scope/workerScope.js";

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

  // 3) Resolve HARD worker scope (source of truth)
  const scope = await getWorkerScope({
    prisma: db,
    env: process.env,
    workerName: env.WORKER_NAME,
  });

  console.log(`[${env.WORKER_NAME}] WORKER_SCOPE`, scope);

  const instanceId =
    (process.env.WORKER_INSTANCE_ID || "").trim() || `${env.WORKER_NAME}:${randomUUID()}`;

  // ---- shutdown helpers (defined BEFORE we register handlers) ----

  const markLeaseStoppedSafe = async () => {
    try {
      await db.workerLease.update({
        where: { brokerAccountId: scope.brokerAccountId },
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

  const uiChannel = ably.channels.get(`aura:ui:${scope.clerkUserId}`);
  const brokerChannel = ably.channels.get(
    `aura:broker:${scope.clerkUserId}:${scope.brokerName}:${scope.brokerAccountId}`
  );

  // 4b) Daily summary scheduler
  startDailyScheduler({
    tz: "Europe/London",
    onRun: async () => {
      const { emitDailySummary } = await import("./notifications/emitDailySummary.js");
      await emitDailySummary({
        prisma: db,
        clerkUserId: scope.clerkUserId,
      });
    },
  });

  // 5) Claim/renew WorkerLease (single-worker per broker account)
  const leaseTtlMs = 60_000; // consider dead if not seen in 60s
  const now = new Date();

  const existingLease = await db.workerLease.findUnique({
    where: { brokerAccountId: scope.brokerAccountId },
    select: { instanceId: true, lastSeenAt: true },
  });

  if (existingLease && existingLease.instanceId !== instanceId) {
    const ageMs = now.getTime() - new Date(existingLease.lastSeenAt).getTime();
    if (ageMs < leaseTtlMs) {
      console.log(`[${env.WORKER_NAME}] lease held by another instance - exiting`, {
        brokerAccountId: scope.brokerAccountId,
        currentInstanceId: existingLease.instanceId,
        thisInstanceId: instanceId,
        lastSeenAt: existingLease.lastSeenAt,
        ageMs,
      });
      process.exit(0);
    }
  }

  await db.workerLease.upsert({
    where: { brokerAccountId: scope.brokerAccountId },
    create: {
      brokerAccountId: scope.brokerAccountId,
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

  console.log(`[${env.WORKER_NAME}] lease claimed`, {
    brokerAccountId: scope.brokerAccountId,
    instanceId,
  });

  // 5d) Heartbeat loop (updates BrokerAccount.lastHeartbeatAt + WorkerLease.lastSeenAt)
  const heartbeatEveryMs = 15_000;

  const heartbeatInterval = setInterval(() => {
    const ts = new Date();

    void db
      .$transaction([
        db.brokerAccount.update({
          where: { id: scope.brokerAccountId },
          data: { lastHeartbeatAt: ts },
          select: { id: true },
        }),
        db.workerLease.update({
          where: { brokerAccountId: scope.brokerAccountId },
          data: { lastSeenAt: ts, status: "RUNNING" },
          select: { id: true },
        }),
      ])
      .catch((e) => {
        console.warn(`[${env.WORKER_NAME}] heartbeat failed`, {
          brokerAccountId: scope.brokerAccountId,
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
            scope,
          },
          userId: scope.userId,
          brokerAccountId: scope.brokerAccountId,
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
    clerkUserId: scope.clerkUserId,
    brokerName: scope.brokerName,
    brokerAccountId: scope.brokerAccountId,
    log: (msg, extra) => console.log(msg, extra ?? ""),
    placeManualBracket: async (p) => {
      // 1) PROVE Ably delivery by writing to EventLog immediately
      try {
        await db.eventLog.create({
          data: {
            type: "exec.manual_received",
            level: "info",
            message: "Manual order received from Ably",
            data: {
              brokerName: scope.brokerName,
              brokerAccountId: scope.brokerAccountId,
              contractId: p.contractId,
              side: p.side,
              size: p.size,
              stopLossTicks: p.stopLossTicks,
              takeProfitTicks: p.takeProfitTicks,
            },
            userId: scope.userId,
            brokerAccountId: scope.brokerAccountId,
          },
          select: { id: true },
        });
      } catch (e) {
        console.warn(`[${env.WORKER_NAME}] failed to write exec.manual_received`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // 2) If broker not ready, record it and stop (no order attempt)
      if (!brokerRef) {
        try {
          await db.eventLog.create({
            data: {
              type: "exec.manual_ignored",
              level: "warn",
              message: "Manual order ignored: broker not ready yet",
              data: { reason: "brokerRef_null" },
              userId: scope.userId,
              brokerAccountId: scope.brokerAccountId,
            },
            select: { id: true },
          });
        } catch {}
        return;
      }

      // 3) Normal path (will emit exec.% via executeBracket)
      const execKey = `manual:${scope.clerkUserId}:${scope.brokerName}:${scope.brokerAccountId}:${Date.now()}`;

      await executeBracket({
        prisma: db,
        broker: brokerRef,
        input: {
          execKey,
          userId: scope.userId,
          brokerAccountId: scope.brokerAccountId,
          brokerName: (brokerRef as any)?.name ?? scope.brokerName,
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
      scope,
      onBrokerReady: async (b) => {
        brokerRef = b;

        console.log(`[${env.WORKER_NAME}] broker ready for exec`, {
          name: (b as any)?.name ?? null,
        });

        const { resumeOpenExecutions } = await import("./execution/resumeOpenExecutions.js");

        await resumeOpenExecutions({
          prisma: db,
          broker: b,
          userId: scope.userId,
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
  