import { env, DRY_RUN, CQG_ENABLED } from "./env.js";
import { db, checkDb } from "./db.js";
import { createAblyRealtime } from "./ably.js";
import { acquireLock, refreshLock, releaseLock } from "./locks.js";
import { randomUUID } from "crypto";
import { startBrokerFeed } from "./broker/startBrokerFeed.js";

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

  // 3) Connect to Ably (lifecycle + UI only)
  const ably = createAblyRealtime();
  await new Promise<void>((resolve, reject) => {
    ably.connection.on("connected", () => resolve());
    ably.connection.on("failed", () =>
      reject(new Error("Ably connection failed"))
    );
  });
  console.log(`[${env.WORKER_NAME}] Ably connected`);

  // 4) Start broker feed (broker owns execution)
  const expectedClerkUserId = (process.env.AURA_CLERK_USER_ID || "").trim();
  if (!expectedClerkUserId) {
    throw new Error(
      `[${env.WORKER_NAME}] Missing AURA_CLERK_USER_ID`
    );
  }

  const brokerChannel = ably.channels.get(`aura:broker:${expectedClerkUserId}`);
  const uiChannel = ably.channels.get(`aura:ui:${expectedClerkUserId}`);

  try {
    await startBrokerFeed(async (event) => {
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
