import { env, DRY_RUN, CQG_ENABLED } from "./env.js";
import { db, checkDb } from "./db.js";
import { createAblyRealtime } from "./ably.js";
import { getSafetyStateForUser } from "./safety.js";
import { hasSeen, markSeen } from "./idempotency.js";
import { logEvent } from "./audit.js";
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

  // Refresh lock periodically (heartbeat)
  const refreshEveryMs = Math.floor(lockTtlMs / 2);
  const lockInterval = setInterval(() => {
    void refreshLock(lockKey, lockTtlMs, lockOwnerId).catch((e) => {
      console.warn(`[${env.WORKER_NAME}] lock refresh failed`, e);
    });
  }, refreshEveryMs);

  // Ensure we release lock on exit
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

  // 3) Connect to Ably
  const ably = createAblyRealtime();
  await new Promise<void>((resolve, reject) => {
    ably.connection.on("connected", () => resolve());
    ably.connection.on("failed", () =>
      reject(new Error("Ably connection failed"))
    );
  });
  console.log(`[${env.WORKER_NAME}] Ably connected`);

  // 4) Start broker feed (non-blocking)
  // 4) Start broker feed + emit lifecycle events to Ably
  const brokerChannel = ably.channels.get("aura:broker");

  try {
    await startBrokerFeed(async (event) => {
      await brokerChannel.publish(event.name, event);
      console.log(`[${env.WORKER_NAME}] published broker event`, {
        name: event.name,
        broker: event.broker,
        data: event.data ?? null,
      });
    });
  } catch (e) {
    console.error(`[${env.WORKER_NAME}] broker start failed`, e);
    process.exit(1);
  }

  // 5) Subscribe to execution commands
  const channel = ably.channels.get("aura:exec");

  channel.subscribe(async (msg) => {
    console.log("[cqg-worker] RAW MESSAGE RECEIVED", {
      msgId: msg.id,
      msgName: msg.name,
      data: msg.data,
    });

    const payload = msg.data as any;

    // Idempotency key
    const idemKey = `exec:${msg.id}`;
    if (await hasSeen(idemKey)) return;
    await markSeen(idemKey, { seenAt: new Date().toISOString() });

    const clerkUserId = payload?.clerkUserId;
    if (!clerkUserId) return;

    let safety;
    try {
      console.log("[cqg-worker] calling getSafetyStateForUser", clerkUserId);
      safety = await getSafetyStateForUser(clerkUserId);
      console.log("[cqg-worker] safety result", safety);
    } catch (err) {
      console.error("[cqg-worker] getSafetyStateForUser FAILED", err);
      return;
    }

    if (!safety.allow) {
      await logEvent({
        level: "WARN",
        type: "EXEC_BLOCKED",
        message: `Blocked execution: ${safety.reason}`,
        data: { payload },
        userId: null,
      });
      return;
    }

    await logEvent({
      level: "INFO",
      type: "EXEC_ALLOWED",
      message: DRY_RUN
        ? "Dry run: would execute trade"
        : "Would execute trade (not implemented yet)",
      data: { payload, selectedSymbol: safety.state.selectedSymbol },
      userId: safety.userId,
    });
  });

  console.log(`[${env.WORKER_NAME}] listening on Ably channel aura:exec`);
}

main()
  .catch((e) => {
    console.error("worker crash", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
