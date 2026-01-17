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
  const uiChannel = ably.channels.get("aura:ui"); // UI-facing AuraRealtimeEvent stream

  try {
    await startBrokerFeed(async (event) => {
      // Always publish raw broker events (debug / internal)
      await brokerChannel.publish(event.name, event);

      // Additionally publish UI-friendly AuraRealtimeEvent for candle close
      if (event.name === "candle.15s.closed" && event.data) {
        const d: any = event.data;

        // d is Candle15s from candle15sAggregator:
        // { contractId, t0(ms), o,h,l,c, ticks }
        const auraEvt = {
          type: "candle_closed",
          ts: event.ts,
          data: {
            symbol: String(d.contractId),
            timeframe: "15s",
            time: Math.floor(Number(d.t0) / 1000), // epoch seconds (open time)
            open: Number(d.o),
            high: Number(d.h),
            low: Number(d.l),
            close: Number(d.c),
            // volume optional; we don't have real volume yet
          },
        };

        await uiChannel.publish("aura", auraEvt);
      }

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

// If DRY_RUN, we just log. If not, we execute via ProjectX.
if (DRY_RUN) {
  await logEvent({
    level: "INFO",
    type: "EXEC_ALLOWED",
    message: "Dry run: would execute trade",
    data: { payload, selectedSymbol: safety.state.selectedSymbol },
    userId: safety.userId,
  });
  return;
}

const execContractId =
  String(payload?.contractId || "").trim() ||
  String(safety?.state?.selectedSymbol || "").trim();

const execSideRaw = String(payload?.side || "").toLowerCase().trim();
const execSide = execSideRaw === "sell" ? "sell" : "buy";

const execSize = Number(payload?.size ?? payload?.qty ?? payload?.contracts ?? 1);
const stopLossTicks = payload?.stopLossTicks != null ? Number(payload.stopLossTicks) : null;
const takeProfitTicks =
  payload?.takeProfitTicks != null ? Number(payload.takeProfitTicks) : null;

if (!execContractId) {
  await logEvent({
    level: "ERROR",
    type: "EXEC_FAILED",
    message: "Missing contractId (payload.contractId or safety.state.selectedSymbol)",
    data: { payload, selectedSymbol: safety?.state?.selectedSymbol ?? null },
    userId: safety.userId,
  });
  return;
}

if (!Number.isFinite(execSize) || execSize <= 0) {
  await logEvent({
    level: "ERROR",
    type: "EXEC_FAILED",
    message: `Invalid size: ${String(execSize)}`,
    data: { payload },
    userId: safety.userId,
  });
  return;
}

// NOTE: this assumes you have a `broker` object in scope in index.ts (you do, since you start it above).
const brokerAny = broker as any;

if (typeof brokerAny?.placeOrderWithBrackets !== "function") {
  await logEvent({
    level: "ERROR",
    type: "EXEC_FAILED",
    message: "Broker does not support placeOrderWithBrackets",
    data: { brokerName: brokerAny?.name ?? null, payload },
    userId: safety.userId,
  });
  return;
}

try {
  const res = await brokerAny.placeOrderWithBrackets({
    contractId: execContractId,
    side: execSide,
    size: execSize,
    type: "market",
    stopLossTicks,
    takeProfitTicks,
    customTag: `aura-${safety.userId ?? "user"}-${Date.now()}`,
  });

    await logEvent({
      level: "INFO",
      type: "EXEC_SUBMITTED",
      message: `Order submitted: ${res?.orderId ?? "unknown"}`,
      data: {
        orderId: res?.orderId ?? null,
        contractId: execContractId,
        side: execSide,
        size: execSize,
        stopLossTicks,
        takeProfitTicks,
        payload,
      },
      userId: safety.userId,
    });

    console.log("[worker] EXEC_SUBMITTED", {
      orderId: res?.orderId ?? null,
      contractId: execContractId,
      side: execSide,
      size: execSize,
      stopLossTicks,
      takeProfitTicks,
    });
  } catch (err) {
    console.error("[worker] EXEC_FAILED", err);

    await logEvent({
      level: "ERROR",
      type: "EXEC_FAILED",
      message: "Order submit failed",
      data: {
        error: err instanceof Error ? err.message : String(err),
        contractId: execContractId,
        side: execSide,
        size: execSize,
        stopLossTicks,
        takeProfitTicks,
        payload,
      },
      userId: safety.userId,
    });
  }

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
