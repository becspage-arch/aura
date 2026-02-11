// worker/src/broker/projectx/startProjectXUserFeed.ts
import { ProjectXUserHub } from "./projectxUserHub.js";

function toNum(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toStr(v: any): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export async function startProjectXUserFeed(params: {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  getPrisma: () => any;
  getUserIdentityForWorker: () => Promise<{ clerkUserId: string; userId: string }>;

  token: string;
  accountId?: number | null;
}) {
  const hub = new ProjectXUserHub({
    token: params.token,
    accountId: params.accountId ?? null,
    debugInvocations: process.env.PROJECTX_USER_DEBUG === "1",

    onOrder: async (payload) => {
      // Always log raw
      const db = params.getPrisma();
      const ident = await params.getUserIdentityForWorker();

      await db.eventLog.create({
        data: {
          type: "user.order",
          level: "info",
          message: "ProjectX user order",
          data: { clerkUserId: ident.clerkUserId, broker: "projectx", payload },
          userId: ident.userId,
        },
      });

      // Best-effort: update Execution when we can correlate by orderId/customTag
      const orderId = toStr(payload?.orderId ?? payload?.id);
      const customTag = toStr(payload?.customTag ?? payload?.tag);

      if (!orderId && !customTag) return;

      try {
        if (orderId) {
          await db.execution.updateMany({
            where: { entryOrderId: orderId, userId: ident.userId },
            data: { status: "ORDER_ACCEPTED" },
          });
        } else if (customTag) {
          await db.execution.updateMany({
            where: { execKey: customTag, userId: ident.userId },
            data: { status: "ORDER_ACCEPTED" },
          });
        }
      } catch (e) {
        console.warn("[projectx-user] execution update (order) failed (non-fatal)", e);
      }
    },

    onTrade: async (payload) => {
      const db = params.getPrisma();
      const ident = await params.getUserIdentityForWorker();

      await db.eventLog.create({
        data: {
          type: "user.trade",
          level: "info",
          message: "ProjectX user trade (fill)",
          data: { clerkUserId: ident.clerkUserId, broker: "projectx", payload },
          userId: ident.userId,
        },
      });

      // Correlate to Execution if possible
      const orderId = toStr(payload?.orderId ?? payload?.parentOrderId ?? payload?.id);
      const customTag = toStr(payload?.customTag ?? payload?.tag);

      if (orderId) {
        await db.execution.updateMany({
          where: { entryOrderId: orderId, userId: ident.userId },
          data: { status: "ORDER_FILLED" },
        });
      } else if (customTag) {
        await db.execution.updateMany({
          where: { execKey: customTag, userId: ident.userId },
          data: { status: "ORDER_FILLED" },
        });
      }
    },

    onPosition: async (payload) => {
      const db = params.getPrisma();
      const ident = await params.getUserIdentityForWorker();

      await db.eventLog.create({
        data: {
          type: "user.position",
          level: "info",
          message: "ProjectX user position update",
          data: { clerkUserId: ident.clerkUserId, broker: "projectx", payload },
          userId: ident.userId,
        },
      });

      // Debug: log raw position payload + our "flat detection" inputs
      console.log(
        "[projectx-user] POS_PAYLOAD_JSON GatewayUserPosition",
        JSON.stringify(payload)
      );

      const qtyDebug =
        toNum(payload?.qty) ??
        toNum(payload?.quantity) ??
        toNum(payload?.positionQty) ??
        toNum(payload?.netQty) ??
        toNum(payload?.netPosition) ??
        toNum(payload?.position) ??
        null;

      const isFlatDebug =
        (typeof qtyDebug === "number" && qtyDebug === 0) ||
        payload?.isFlat === true ||
        payload?.closed === true ||
        payload?.status === "CLOSED" ||
        payload?.positionStatus === "CLOSED" ||
        payload?.marketPosition === "Flat" ||
        payload?.marketPosition === 0;

      console.log("[projectx-user] POS_FLAT_DEBUG", {
        qtyDebug,
        status: payload?.status,
        positionStatus: payload?.positionStatus,
        marketPosition: payload?.marketPosition,
        isFlatDebug,
      });

      // Only treat as closed when we are confident it's flat/closed
      const isFlat = isFlatDebug;
      if (!isFlat) return;

      // Compute realized PnL if supplied, else default 0 for now.
      const pnl =
        toNum(payload?.realizedPnlUsd) ??
        toNum(payload?.realizedPnl) ??
        toNum(payload?.pnl) ??
        0;

      // Outcome from pnl
      const outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN";

      // rrAchieved: only store if your payload includes it; otherwise null
      const rrAchieved = toNum(payload?.rrAchieved);

      const closedAt = new Date();

      const contractId =
        toStr(payload?.contractId) ??
        toStr(payload?.instrumentId) ??
        toStr(payload?.symbolId) ??
        null;

      // Avoid ?? with || ambiguity by splitting
      const envSymbol = (process.env.PROJECTX_SYMBOL ?? "").trim();

      const symbol =
        toStr(payload?.symbol) ??
        toStr(payload?.symbolId) ??
        (envSymbol || contractId || "UNKNOWN");

      const sideRaw = toStr(payload?.side) ?? toStr(payload?.entrySide) ?? null;
      const side = (sideRaw || "").toLowerCase().includes("sell") ? "SELL" : "BUY";

      // Use qty from payload if present; otherwise fallback to qtyDebug; otherwise 0
      const qtyNum =
        toNum(payload?.qty) ??
        toNum(payload?.quantity) ??
        toNum(payload?.positionQty) ??
        toNum(payload?.netQty) ??
        qtyDebug ??
        0;

      const entryPrice =
        toNum(payload?.entryPriceAvg) ??
        toNum(payload?.avgEntryPrice) ??
        toNum(payload?.entryPrice) ??
        toNum(payload?.avgPrice) ??
        0;

      const exitPrice =
        toNum(payload?.exitPriceAvg) ??
        toNum(payload?.avgExitPrice) ??
        toNum(payload?.exitPrice) ??
        toNum(payload?.closePrice) ??
        0;

      // stable-ish idempotency key for "this close event"
      const closeKey =
        toStr(payload?.closedAt) ??
        toStr(payload?.timestamp) ??
        toStr(payload?.ts) ??
        String(closedAt.getTime());

      const refOrderId =
        toStr(payload?.entryOrderId) ??
        toStr(payload?.orderId) ??
        toStr(payload?.id) ??
        "noorder";

      const execKey = `projectx:close:${ident.clerkUserId}:${symbol}:${refOrderId}:${closeKey}`;

      try {
        console.log("[projectx-user] TRADE_UPSERT_ATTEMPT", {
          clerkUserId: ident.clerkUserId,
          outcome,
          pnl,
          isFlat: true,
          execKey,
        });

        await db.trade.upsert({
          where: { execKey },
          create: {
            clerkUserId: ident.clerkUserId,
            execKey,

            symbol,
            contractId,

            side, // "BUY" | "SELL"
            qty: qtyNum,

            openedAt: closedAt, // we don't have open time reliably yet
            closedAt,
            durationSec: null,

            plannedStopTicks: null,
            plannedTakeProfitTicks: null,
            plannedRiskUsd: null,
            plannedRR: null,

            entryPriceAvg: entryPrice,
            exitPriceAvg: exitPrice,
            realizedPnlTicks: 0,
            realizedPnlUsd: pnl,
            rrAchieved: rrAchieved ?? null,

            exitReason: "UNKNOWN",
            outcome,
          },
          update: {
            closedAt,
            realizedPnlUsd: pnl,
            outcome,
            rrAchieved: rrAchieved ?? null,
          },
        });

        console.log("[projectx-user] TRADE_UPSERT_OK", {
          clerkUserId: ident.clerkUserId,
          outcome,
          pnl,
          execKey,
        });
      } catch (e) {
        console.error("[projectx-user] TRADE_UPSERT_FAILED", {
          execKey,
          err: e instanceof Error ? e.message : String(e),
        });
      }

      // Optional: mark executions “position closed” if we can correlate (best-effort)
      const orderId = toStr(payload?.orderId ?? payload?.entryOrderId ?? payload?.id);
      if (orderId) {
        await db.execution.updateMany({
          where: { entryOrderId: orderId, userId: ident.userId },
          data: { status: "POSITION_CLOSED" },
        });
      }
    },
  });

  console.log("[projectx-user] START_PROJECTX_USERFEED_BOOT", {
    worker: params.env.WORKER_NAME,
    at: new Date().toISOString(),
  });

  await hub.start();

  console.log("[projectx-user] started", {
    accountId: params.accountId ?? null,
  });

  return hub;
}
