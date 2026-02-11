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

type ExitPnlCacheRow = {
  pnlUsd: number;
  tsMs: number;
  tradeId?: string | null;
  orderId?: string | null;
};

export async function startProjectXUserFeed(params: {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  getPrisma: () => any;
  getUserIdentityForWorker: () => Promise<{ clerkUserId: string; userId: string }>;

  token: string;
  accountId?: number | null;
}) {
  // Cache the most recent EXIT pnl for a short window so onPosition(close) can use it.
  // Keyed by accountId + contractId (good enough for now since you trade one instrument).
  const exitPnlByAcctContract = new Map<string, ExitPnlCacheRow>();

  // De-dupe “close” handling because ProjectX can emit multiple flat position updates.
  // Keyed by a stable closeKey derived from the position payload.
  const processedCloseKeys = new Map<string, number>();
  const CLOSE_DEDUPE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  function pruneDedupe(nowMs: number) {
    for (const [k, t] of processedCloseKeys) {
      if (nowMs - t > CLOSE_DEDUPE_TTL_MS) processedCloseKeys.delete(k);
    }
  }

  function makeAcctContractKey(payload: any): string | null {
    const acct = toStr(payload?.accountId);
    const contract = toStr(payload?.contractId);
    if (!acct || !contract) return null;
    return `${acct}:${contract}`;
  }

  function makeStableCloseKey(payload: any): string {
    // Prefer fields that stay the same across repeated “flat” updates
    const posId = toStr(payload?.id) ?? "nopos";
    const created =
      toStr(payload?.creationTimestamp) ??
      toStr(payload?.createdAt) ??
      toStr(payload?.timestamp) ??
      "nocreated";
    const type = toStr(payload?.type) ?? "notype";
    const size = toStr(payload?.size) ?? "nosize";
    const acct = toStr(payload?.accountId) ?? "noacct";
    const contract = toStr(payload?.contractId) ?? "nocontract";
    return `pxclose:${acct}:${contract}:${posId}:${created}:${type}:${size}`;
  }

  const hub = new ProjectXUserHub({
    token: params.token,
    accountId: params.accountId ?? null,
    debugInvocations: process.env.PROJECTX_USER_DEBUG === "1",

    onOrder: async (payload) => {
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

      // Cache EXIT profitAndLoss so onPosition(close) can use it.
      // From your logs: exit fills include profitAndLoss, entry fills do not.
      const pnl = toNum(payload?.profitAndLoss);
      if (typeof pnl === "number") {
        const key = makeAcctContractKey(payload);
        if (key) {
          exitPnlByAcctContract.set(key, {
            pnlUsd: pnl,
            tsMs: Date.now(),
            tradeId: toStr(payload?.id),
            orderId: toStr(payload?.orderId),
          });

          console.log("[projectx-user] EXIT_PNL_CACHED", { key, pnlUsd: pnl });
        }
      }

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
        payload?.marketPosition === 0 ||
        payload?.size === 0;

      console.log("[projectx-user] POS_FLAT_DEBUG", {
        qtyDebug,
        size: payload?.size,
        type: payload?.type,
        status: payload?.status,
        positionStatus: payload?.positionStatus,
        marketPosition: payload?.marketPosition,
        isFlatDebug,
      });

      if (!isFlatDebug) return;

      // De-dupe repeated “flat” updates
      const nowMs = Date.now();
      pruneDedupe(nowMs);

      const closeKeyStable = makeStableCloseKey(payload);
      if (processedCloseKeys.has(closeKeyStable)) {
        console.log("[projectx-user] CLOSE_DEDUPED", { closeKeyStable });
        return;
      }
      processedCloseKeys.set(closeKeyStable, nowMs);

      // PnL: prefer position payload, else use cached exit pnl (recent)
      const pnlFromPos =
        toNum(payload?.realizedPnlUsd) ??
        toNum(payload?.realizedPnl) ??
        toNum(payload?.pnl) ??
        null;

      let pnl: number = 0;
      if (typeof pnlFromPos === "number") {
        pnl = pnlFromPos;
      } else {
        const key = makeAcctContractKey(payload);
        const cached = key ? exitPnlByAcctContract.get(key) : null;

        // Only trust if it’s very recent (position close arrives right after the exit fill)
        const MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes
        if (cached && nowMs - cached.tsMs <= MAX_AGE_MS) {
          pnl = cached.pnlUsd;
          console.log("[projectx-user] PNL_FROM_CACHED_EXIT", {
            key,
            pnlUsd: pnl,
            cachedTradeId: cached.tradeId ?? null,
            cachedOrderId: cached.orderId ?? null,
          });
        } else {
          pnl = 0;
          console.log("[projectx-user] PNL_MISSING_DEFAULT_0", { key, cached: !!cached });
        }
      }

      const outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN";
      const rrAchieved = toNum(payload?.rrAchieved);

      const closedAt = new Date();

      const contractId =
        toStr(payload?.contractId) ??
        toStr(payload?.instrumentId) ??
        toStr(payload?.symbolId) ??
        null;

      const envSymbol = (process.env.PROJECTX_SYMBOL ?? "").trim();
      const symbol =
        toStr(payload?.symbol) ??
        toStr(payload?.symbolId) ??
        (envSymbol || contractId || "UNKNOWN");

      const sideRaw = toStr(payload?.side) ?? toStr(payload?.entrySide) ?? null;
      const side = (sideRaw || "").toLowerCase().includes("sell") ? "SELL" : "BUY";

      // On close payload, size is 0, so qty is not reliable.
      // Keep qtyNum as 1 by default if missing (since your trades are 1-lots right now).
      const qtyNum =
        toNum(payload?.qty) ??
        toNum(payload?.quantity) ??
        toNum(payload?.positionQty) ??
        toNum(payload?.netQty) ??
        1;

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

      // Use stable close key so we upsert the same row on repeats
      const execKey = `projectx:close:${ident.clerkUserId}:${symbol}:${closeKeyStable}`;

      try {
        console.log("[projectx-user] TRADE_UPSERT_ATTEMPT", {
          clerkUserId: ident.clerkUserId,
          outcome,
          pnl,
          closeKeyStable,
          execKey,
        });

        await db.trade.upsert({
          where: { execKey },
          create: {
            clerkUserId: ident.clerkUserId,
            execKey,

            symbol,
            contractId,

            side,
            qty: qtyNum,

            openedAt: closedAt, // not available reliably yet
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

      // Best-effort: mark executions “position closed” if we can correlate
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
