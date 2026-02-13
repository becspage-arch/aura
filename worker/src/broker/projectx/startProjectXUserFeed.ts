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
      try {
        // ProjectX accountId -> BrokerAccount.id (FK)
        const acctExternalId = toStr(payload?.accountId ?? params.accountId);
        if (!acctExternalId) {
          console.warn("[projectx-user] FILL_SKIPPED_NO_ACCOUNT_ID", {
            payloadAccountId: payload?.accountId,
            paramsAccountId: params.accountId,
          });
          return;
        }

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
            userId: ident.userId,
          },
          select: { id: true },
        });

        // ProjectX fields (based on the EventLog payload you pasted)
        const fillExternalId = toStr(payload?.id); // e.g. 2116125433 (trade/fill id)
        const fillOrderExternalId = toStr(payload?.orderId ?? payload?.parentOrderId) ?? null;

        const fillSymbol =
          toStr(payload?.symbol) ??
          toStr(payload?.contractId) ??
          toStr(payload?.instrumentId) ??
          "UNKNOWN";

        // Side is numeric in your real payload (side: 1)
        function normalizeSide(v: any): "BUY" | "SELL" {
          if (typeof v === "number") return v === 1 ? "SELL" : "BUY";
          const s = (toStr(v) ?? "").toLowerCase();
          if (s.includes("sell") || s === "s" || s === "short") return "SELL";
          return "BUY";
        }
        const fillSide = normalizeSide(payload?.side);

        const fillQty = toNum(payload?.qty ?? payload?.quantity ?? payload?.size) ?? 0;

        const fillPrice =
          toNum(payload?.price) ??
          toNum(payload?.fillPrice) ??
          toNum(payload?.averagePrice) ??
          0;

        const filledAt =
          payload?.creationTimestamp ? new Date(String(payload.creationTimestamp)) : null;

        // Ensure we have an Order row to link to (by broker order id)
        // NOTE: We do NOT pretend we know the intended qty here; we just store what we know from the fill.
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
              status: "NEW",
              qty: fillQty,
              price: null,
              stopPrice: null,
              filledQty: 0,
              avgFillPrice: null,
            },
            update: {
              symbol: fillSymbol,
              side: fillSide,
            },
            select: { id: true },
          });
        }

        // Idempotent fill write (no findFirst + create race)
        if (!fillExternalId) {
          console.warn("[projectx-user] FILL_SKIPPED_NO_EXTERNAL_ID", {
            brokerAccountId: brokerAccount.id,
            orderExternalId: fillOrderExternalId,
            symbol: fillSymbol,
          });
          return;
        }

        await db.fill.upsert({
          where: {
            brokerAccountId_externalId: {
              brokerAccountId: brokerAccount.id,
              externalId: fillExternalId,
            },
          },
          create: {
            brokerAccountId: brokerAccount.id,
            orderId: orderRow?.id ?? null,
            externalId: fillExternalId,
            symbol: fillSymbol,
            side: fillSide,
            qty: fillQty,
            price: fillPrice,
            filledAt,
          },
          update: {
            // keep linkage updated if we learned Order later
            orderId: orderRow?.id ?? undefined,
            symbol: fillSymbol,
            side: fillSide,
            qty: fillQty,
            price: fillPrice,
            filledAt,
          },
        });

                // --- ROLL UP: Fill -> Order (8E.4b) ---
        if (orderRow?.id) {
          try {
            const agg = await db.fill.aggregate({
              where: { orderId: orderRow.id },
              _sum: { qty: true },
              _avg: { price: true },
            });

            const filledQtySum = Number(agg._sum.qty ?? 0);
            const avgFillPrice = agg._avg.price == null ? null : Number(agg._avg.price);

            // Load intended order qty so we can mark FILLED vs PARTIAL
            const ord = await db.order.findUnique({
              where: { id: orderRow.id },
              select: { qty: true },
            });

            const orderQty = ord?.qty == null ? 0 : Number(ord.qty);

            // tiny tolerance for numeric/decimal conversions
            const EPS = 1e-9;

            const nextStatus =
              orderQty > 0 && filledQtySum + EPS >= orderQty ? "FILLED" : filledQtySum > 0 ? "PARTIAL" : "NEW";

            await db.order.update({
              where: { id: orderRow.id },
              data: {
                filledQty: filledQtySum,
                avgFillPrice,
                status: nextStatus,
              },
            });

            console.log("[projectx-user] ORDER_ROLLUP_OK", {
              orderExternalId: fillOrderExternalId ?? null,
              filledQty: filledQtySum,
              avgFillPrice,
              status: nextStatus,
            });
          } catch (e) {
            console.warn("[projectx-user] ORDER_ROLLUP_FAILED (non-fatal)", {
              err: e instanceof Error ? e.message : String(e),
              orderExternalId: fillOrderExternalId ?? null,
            });
          }
        }

        console.log("[projectx-user] FILL_UPSERT_OK", {
          brokerAccountId: brokerAccount.id,
          externalId: fillExternalId,
          orderExternalId: fillOrderExternalId ?? null,
          orderRowId: orderRow?.id ?? null,
          filledAt: filledAt ? filledAt.toISOString() : null,
        });
      } catch (e) {
        console.warn("[projectx-user] FILL_UPSERT_FAILED (non-fatal)", {
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

            // -----------------------------
      // Pull planned SL/TP + contracts from the most recent open-ish Execution
      // (ProjectX flat position payload does NOT include these)
      // -----------------------------
      const symbolForLookup =
        toStr(payload?.symbol) ??
        toStr(payload?.symbolId) ??
        (envSymbol || contractId || "UNKNOWN");

      const latestExecution = await db.execution.findFirst({
        where: {
          userId: ident.userId,
          brokerName: "projectx",
          status: { in: ["ORDER_FILLED", "POSITION_OPEN", "BRACKET_ACTIVE", "BRACKET_SUBMITTED"] },
          OR: [
            contractId ? { contractId } : undefined,
            symbolForLookup ? { symbol: symbolForLookup } : undefined,
          ].filter(Boolean) as any,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          qty: true,
          stopLossTicks: true,
          takeProfitTicks: true,
        },
      });

      const contractsFromExec =
        latestExecution?.qty != null ? Number(latestExecution.qty) : null;

      const stopTicksFromExec =
        latestExecution?.stopLossTicks != null ? Number(latestExecution.stopLossTicks) : null;

      const tpTicksFromExec =
        latestExecution?.takeProfitTicks != null ? Number(latestExecution.takeProfitTicks) : null;

      // Tick value mapping (MGC=$1 per tick, GC=$10 per tick). If unknown, leave null.
      function tickValueUsd(sym: string): number | null {
        const s = (sym || "").toUpperCase();
        if (s.includes("MGC")) return 1;
        if (s.includes("GC")) return 10;
        return null;
      }

      const tickUsd = tickValueUsd(symbolForLookup);
      const plannedRiskUsd =
        tickUsd != null && stopTicksFromExec != null && contractsFromExec != null
          ? stopTicksFromExec * tickUsd * contractsFromExec
          : null;

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

      const acctId =
        toStr(payload?.accountId ?? params.accountId) ?? "unknownAcct";

      const positionId =
        toStr(payload?.positionId) ??
        toStr(payload?.id) ??
        toStr(payload?.position?.id) ??
        "nopos";

      // Deterministic close identity:
      // accountId + positionId are stable for a closed position
      const execKey = `projectx:close:${ident.clerkUserId}:${symbol}:${acctId}:${positionId}`;

      console.log("[projectx-user] POS_CLOSE_KEYS_JSON", {
        accountId: payload?.accountId ?? params.accountId ?? null,
        contractId:
          payload?.contractId ??
          payload?.instrumentId ??
          payload?.symbolId ??
          null,
        positionId:
          payload?.positionId ??
          payload?.id ??
          payload?.position?.id ??
          null,
        entryOrderId: payload?.entryOrderId ?? null,
        orderId: payload?.orderId ?? null,
        id: payload?.id ?? null,
        execKey,
      });


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
            // Prefer contracts from Execution (real contracts) because ProjectX "flat" payload makes size 0
            qty: contractsFromExec != null ? contractsFromExec : qtyNum,

            openedAt: closedAt,
            closedAt,
            durationSec: null,

            plannedStopTicks: stopTicksFromExec,
            plannedTakeProfitTicks: tpTicksFromExec,
            plannedRiskUsd: plannedRiskUsd,
            plannedRR:
              stopTicksFromExec != null && tpTicksFromExec != null && stopTicksFromExec > 0
                ? tpTicksFromExec / stopTicksFromExec
                : null,

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
            qty: contractsFromExec != null ? contractsFromExec : undefined,
            plannedStopTicks: stopTicksFromExec ?? undefined,
            plannedTakeProfitTicks: tpTicksFromExec ?? undefined,
            plannedRiskUsd: plannedRiskUsd ?? undefined,
            plannedRR:
              stopTicksFromExec != null && tpTicksFromExec != null && stopTicksFromExec > 0
                ? tpTicksFromExec / stopTicksFromExec
                : undefined,
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

      // Best-effort: mark recent matching executions closed.
      // Execution model does NOT have a relation to Order,
      // so we keep this conservative (recent window + same contract).
      if (contractId) {
        const recentCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // last 2 hours

        await db.execution.updateMany({
          where: {
            userId: ident.userId,
            brokerName: "projectx",
            contractId,
            status: { in: ["ORDER_FILLED", "POSITION_OPEN"] },
            createdAt: { gte: recentCutoff },
          },
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
