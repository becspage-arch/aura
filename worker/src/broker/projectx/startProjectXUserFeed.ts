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

      // Detect a “closed” / flat position.
      // Different payloads use different fields; we check a few common ones.
      const qty =
        toNum(payload?.qty) ??
        toNum(payload?.quantity) ??
        toNum(payload?.positionQty) ??
        toNum(payload?.netQty) ??
        null;

      const isFlat =
        (typeof qty === "number" && qty === 0) ||
        payload?.isFlat === true ||
        payload?.closed === true ||
        payload?.status === "CLOSED";

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

      // Create a Trade row on close.
      // This matches what your /api/stats expects to read.
      await db.trade.create({
        data: {
          clerkUserId: ident.clerkUserId,
          closedAt: new Date(),
          realizedPnlUsd: pnl,
          outcome,
          rrAchieved: rrAchieved,
        },
      });

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

  await hub.start();

  console.log("[projectx-user] started", {
    accountId: params.accountId ?? null,
  });

  return hub;
}
