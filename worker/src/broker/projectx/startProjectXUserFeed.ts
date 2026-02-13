// worker/src/broker/projectx/startProjectXUserFeed.ts
import { ProjectXUserHub } from "./projectxUserHub.js";
import { emitNotifyEvent } from "../../notifications/emitNotifyEvent.js";

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

type ExitPnlCacheEntry = {
  pnlUsd: number;
  tsMs: number; // when we saw it
  orderId?: string | null;
  tradeId?: string | null;
  contractId?: string | null;
};

export async function startProjectXUserFeed(params: {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  getPrisma: () => any;
  getUserIdentityForWorker: () => Promise<{ clerkUserId: string; userId: string }>;

  token: string;
  accountId?: number | null;
}) {
  // Cache most recent EXIT pnl per (accountId + contractId)
  // ProjectX often gives exit PnL on GatewayUserTrade, not GatewayUserPosition.
  const exitPnlByAcctContract = new Map<string, ExitPnlCacheEntry>();

  function cacheKey(payload: any): string | null {
    const acct = toStr(payload?.accountId ?? params.accountId);
    const contract = toStr(payload?.contractId ?? payload?.instrumentId ?? payload?.symbolId);
    if (!acct || !contract) return null;
    return `${acct}:${contract}`;
  }

  function cacheExitPnlFromTrade(tradePayload: any) {
    const pnl = toNum(tradePayload?.profitAndLoss);
    if (pnl === null) return;

    const key = cacheKey(tradePayload);
    if (!key) return;

    const entry: ExitPnlCacheEntry = {
      pnlUsd: pnl,
      tsMs: Date.now(),
      orderId: toStr(tradePayload?.orderId),
      tradeId: toStr(tradePayload?.id),
      contractId: toStr(tradePayload?.contractId) ?? null,
    };

    exitPnlByAcctContract.set(key, entry);

    console.log("[projectx-user] EXIT_PNL_CACHED", {
      key,
      pnlUsd: entry.pnlUsd,
      orderId: entry.orderId,
      tradeId: entry.tradeId,
      contractId: entry.contractId,
      tsMs: entry.tsMs,
    });
  }

  function getCachedExitPnlForPosition(positionPayload: any): number | null {
    const key = cacheKey(positionPayload);
    if (!key) return null;

    const entry = exitPnlByAcctContract.get(key);
    if (!entry) return null;

    // Must be recent – position-close tends to arrive seconds after the exit trade.
    const ageMs = Date.now() - entry.tsMs;
    const MAX_AGE_MS = 30_000;

    if (ageMs > MAX_AGE_MS) return null;

    console.log("[projectx-user] PNL_FROM_CACHED_EXIT", {
      key,
      pnlUsd: entry.pnlUsd,
      ageMs,
      orderId: entry.orderId,
      tradeId: entry.tradeId,
      contractId: entry.contractId,
    });

    return entry.pnlUsd;
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

      // IMPORTANT: capture EXIT pnl from GatewayUserTrade
      cacheExitPnlFromTrade(payload);

      // --- PERSIST FILL (8E.4) ---
      // --- PERSIST FILL (8E.4) ---
      try {
        // We must map ProjectX accountId -> BrokerAccount.id (FK)
        const acctExternalId = toStr(payload?.accountId ?? params.accountId);
        if (!acctExternalId) {
          console.warn("[projectx-user] FILL_SKIPPED_NO_ACCOUNT_ID", {
            payloadAccountId: payload?.accountId,
            paramsAccountId: params.accountId,
          });
        } else {
          const brokerAccount = await db.brokerAccount.upsert({
            where: {
              brokerName_externalId: {
                brokerName: "projectx",
                externalId: acctExternalId,
              },
            },
            create: {
              userId: ident.userId,
              brokerName: "projectx",
              externalId: acctExternalId,
              accountLabel: null,
            },
            update: {
              // keep userId aligned just in case
              userId: ident.userId,
            },
            select: { id: true },
          });

          const fillOrderExternalId =
            toStr(payload?.orderId ?? payload?.parentOrderId) ?? null;

          const fillExternalId = toStr(payload?.id); // ProjectX trade/fill id

          const fillSymbol =
            toStr(payload?.symbol) ??
            toStr(payload?.contractId) ??
            toStr(payload?.instrumentId) ??
            "UNKNOWN";

          const sideRaw = (toStr(payload?.side) ?? "").toLowerCase();
          const fillSide = sideRaw.includes("sell") ? "SELL" : "BUY";

          const fillQty = toNum(payload?.qty ?? payload?.quantity ?? payload?.size) ?? 0;

          const fillPrice =
            toNum(payload?.price) ??
            toNum(payload?.fillPrice) ??
            toNum(payload?.averagePrice) ??
            0;

          // Create / upsert an Order row ONLY if we have a real broker order id.
          // IMPORTANT: Fill.orderId must reference Order.id (internal), not the broker order id.
          let orderRow: { id: string } | null = null;

          if (fillOrderExternalId) {
            orderRow = await db.order.upsert({
              where: {
                brokerAccountId_externalId: {
                  brokerAccountId: brokerAccount.id,
                  externalId: fillOrderExternalId,
                },
              },
              create: {
                brokerAccountId: brokerAccount.id,
                externalId: fillOrderExternalId,
                symbol: fillSymbol,
                side: fillSide,
                type: "MARKET",
                status: "FILLED",
                qty: fillQty,
                price: null,
                stopPrice: null,
                filledQty: fillQty,
                avgFillPrice: fillPrice,
              },
              update: {
                // keep it aligned in case we learn more later
                symbol: fillSymbol,
                side: fillSide,
                status: "FILLED",
                filledQty: fillQty,
                avgFillPrice: fillPrice,
              },
              select: { id: true },
            });
          }

          // Dedupe fill by (brokerAccountId, externalId) when possible
          if (fillExternalId) {
            const exists = await db.fill.findFirst({
              where: {
                brokerAccountId: brokerAccount.id,
                externalId: fillExternalId,
              },
              select: { id: true },
            });

            if (!exists) {
              await db.fill.create({
                data: {
                  brokerAccountId: brokerAccount.id,
                  orderId: orderRow?.id ?? null, // ✅ real FK target or null
                  externalId: fillExternalId,
                  symbol: fillSymbol,
                  side: fillSide,
                  qty: fillQty,
                  price: fillPrice,
                },
              });
            }
          } else {
            await db.fill.create({
              data: {
                brokerAccountId: brokerAccount.id,
                orderId: orderRow?.id ?? null, // ✅ real FK target or null
                externalId: null,
                symbol: fillSymbol,
                side: fillSide,
                qty: fillQty,
                price: fillPrice,
              },
            });
          }
        }
      } catch (e) {
        console.warn("[projectx-user] FILL_CREATE_FAILED (non-fatal)", {
          err: e instanceof Error ? e.message : String(e),
        });
      }

      await db.eventLog.create({
        data: {
          type: "user.trade",
          level: "info",
          message: "ProjectX user trade (fill)",
          data: { clerkUserId: ident.clerkUserId, broker: "projectx", payload },
          userId: ident.userId,
        },
      });

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
        toNum(payload?.size) ?? // ProjectX position uses size
        null;

      const isFlatDebug =
        (typeof qtyDebug === "number" && qtyDebug === 0) ||
        payload?.isFlat === true ||
        payload?.closed === true ||
        payload?.status === "CLOSED" ||
        payload?.positionStatus === "CLOSED" ||
        payload?.marketPosition === "Flat" ||
        payload?.marketPosition === 0 ||
        payload?.type === 0; // ProjectX position: type 0 commonly corresponds to flat

      console.log("[projectx-user] POS_FLAT_DEBUG", {
        qtyDebug,
        status: payload?.status,
        positionStatus: payload?.positionStatus,
        marketPosition: payload?.marketPosition,
        type: payload?.type,
        isFlatDebug,
      });

      if (!isFlatDebug) return;

      // 1) Try position payload fields first
      let pnl =
        toNum(payload?.realizedPnlUsd) ??
        toNum(payload?.realizedPnl) ??
        toNum(payload?.profitAndLoss) ??
        toNum(payload?.pnl) ??
        null;

      // 2) If missing, pull from cached exit trade pnl (profitAndLoss)
      if (pnl === null) {
        pnl = getCachedExitPnlForPosition(payload);
      }

      // 3) Still missing? DO NOT write breakeven — skip and wait for next events.
      if (pnl === null) {
        console.log("[projectx-user] CLOSE_SKIPPED_NO_PNL", {
          clerkUserId: ident.clerkUserId,
          accountId: payload?.accountId ?? params.accountId ?? null,
          contractId: payload?.contractId ?? null,
          qtyDebug,
        });
        return;
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
        toNum(payload?.averagePrice) ?? // ProjectX position uses averagePrice
        0;

      const exitPrice =
        toNum(payload?.exitPriceAvg) ??
        toNum(payload?.avgExitPrice) ??
        toNum(payload?.exitPrice) ??
        toNum(payload?.closePrice) ??
        0;

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

      // Dedupe: only emit notify the first time we see this execKey
      let existed: { id: string } | null = null;
      try {
        existed = await db.trade.findUnique({
          where: { execKey },
          select: { id: true },
        });
      } catch (e) {
        console.warn("[projectx-user] TRADE_FIND_UNIQUE_FAILED (non-fatal)", {
          execKey,
          err: e instanceof Error ? e.message : String(e),
        });
      }

      try {
        console.log("[projectx-user] TRADE_UPSERT_ATTEMPT", {
          clerkUserId: ident.clerkUserId,
          outcome,
          pnl,
          execKey,
        });

        const trade = await db.trade.upsert({
          where: { execKey },
          create: {
            clerkUserId: ident.clerkUserId,
            execKey,

            symbol,
            contractId,

            side,
            qty: qtyNum,

            openedAt: closedAt,
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
          tradeId: trade.id,
        });

        // Emit notification event to the app (which will send email + in-app) ONLY on first creation
        if (!existed) {
          try {
          await emitNotifyEvent({
            name: "trade.closed",
            ts: new Date().toISOString(),
            broker: "projectx",
            clerkUserId: ident.clerkUserId,
            data: {
              tradeId: trade.id,
              accountId: String(payload?.accountId ?? params.accountId ?? "unknown"),
              symbol,
              direction: side === "BUY" ? "long" : "short",
              entryTs: closedAt.toISOString(),
              exitTs: closedAt.toISOString(),
              realisedPnlUsd: pnl,
              result: pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven",
            },
          });

          } catch (e) {
            console.warn("[projectx-user] NOTIFY_EMIT_FAILED", {
              err: e instanceof Error ? e.message : String(e),
            });
          }
        } else {
          console.log("[projectx-user] NOTIFY_SKIPPED_ALREADY_EMITTED", {
            execKey,
            tradeId: trade.id,
          });
        }
      } catch (e) {
        console.error("[projectx-user] TRADE_UPSERT_FAILED", {
          execKey,
          err: e instanceof Error ? e.message : String(e),
        });
      }

      await db.execution.updateMany({
        where: {
          userId: ident.userId,
          status: { in: ["ORDER_FILLED", "POSITION_OPEN"] },
        },
        data: { status: "POSITION_CLOSED" },
      });

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
