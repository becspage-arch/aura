// worker/src/execution/executeBracket.ts

import { PrismaClient, OrderSide } from "@prisma/client";
import type { IBrokerAdapter } from "../broker/IBrokerAdapter.js";
import { logTag } from "../lib/logTags";
import { createHash } from "crypto";

export type ExecuteBracketInput = {
  execKey: string; // deterministic idempotency key
  userId: string;
  brokerName: string;

  contractId: string;
  symbol?: string | null;

  side: "buy" | "sell";
  qty: number;

  // optional: hard cap on qty (broker/user safety rail)
  maxContracts?: number | null;

  entryType: "market" | "limit" | "stop";

  stopLossTicks?: number | null;
  takeProfitTicks?: number | null;

  // optional user-provided tag (keep short if you use it)
  customTag?: string | null;
};

function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function makeBrokerTag(execKey: string): string {
  const h = createHash("sha1").update(execKey).digest("hex").slice(0, 8);
  return `aura-${h}`; // short + unique enough for ProjectX
}

function isFilled(o: any): boolean {
  if (!o) return false;

  const rawStatus = o?.status ?? o?.orderStatus ?? o?.state ?? null;
  const status = rawStatus == null ? "" : String(rawStatus).toUpperCase();

  if (status.includes("FILL")) return true;
  if (status === "2" || status === "FILLED" || status === "COMPLETE") return true;

  const filledQty = Number(
    o?.filledQty ??
      o?.filledQuantity ??
      o?.filledSize ??
      o?.quantityFilled ??
      o?.fillQty ??
      NaN
  );

  const totalQty = Number(o?.qty ?? o?.quantity ?? o?.size ?? o?.orderQty ?? NaN);

  if (Number.isFinite(filledQty) && filledQty > 0) {
    if (!Number.isFinite(totalQty)) return true;
    if (filledQty >= totalQty) return true;
  }

  const filledPrice = Number(o?.filledPrice ?? o?.avgFillPrice ?? NaN);
  if (Number.isFinite(filledPrice) && filledPrice > 0) return true;

  return false;
}

async function ocoWatchAndCancel(params: {
  broker: any;
  execKey: string;
  stopOrderId: string | null;
  tpOrderId: string | null;
  tag: string;
}) {
  const { broker, execKey, stopOrderId, tpOrderId, tag } = params;

  if (!stopOrderId || !tpOrderId) return;
  if (typeof broker.fetchOrderById !== "function") return;
  if (typeof broker.cancelOrder !== "function") return;

  const start = Date.now();
  const timeoutMs = 10 * 60 * 1000; // 10 minutes
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() - start < timeoutMs) {
    try {
      const sl = await broker.fetchOrderById(stopOrderId);
      const tp = await broker.fetchOrderById(tpOrderId);

      const slFilled = isFilled(sl);
      const tpFilled = isFilled(tp);

      if (slFilled && !tpFilled) {
        console.log("[executeBracket] OCO_CANCEL_TP", { execKey, tpOrderId, tag });
        await broker.cancelOrder(tpOrderId, "OCO:SL_FILLED");
        return;
      }

      if (tpFilled && !slFilled) {
        console.log("[executeBracket] OCO_CANCEL_SL", { execKey, stopOrderId, tag });
        await broker.cancelOrder(stopOrderId, "OCO:TP_FILLED");
        return;
      }
    } catch (e: any) {
      console.warn("[executeBracket] OCO_WATCH_ERR", {
        execKey,
        err: e?.message ? String(e.message) : String(e),
      });
    }

    await sleep(1000);
  }

  console.warn("[executeBracket] OCO_WATCH_TIMEOUT", { execKey, tag });
}

export async function executeBracket(params: {
  prisma: PrismaClient;
  broker: IBrokerAdapter;
  input: ExecuteBracketInput;
}) {
  const { prisma, broker, input } = params;

    // --- MAX OPEN TRADES (DB guard) + anti-double-click lock ---
  const maxOpenTrades =
    process.env.AURA_MAX_OPEN_TRADES != null
      ? Number(process.env.AURA_MAX_OPEN_TRADES)
      : 1;

  const lockKey1 = `aura:${input.userId}`;
  const lockKey2 = `openTrade:${input.brokerName}:${input.contractId}:${input.symbol ?? ""}`;

  // Serialize entry attempts for this user+broker+contract so rapid clicks can't stack
  try {
    await prisma.$executeRaw`
      SELECT pg_advisory_lock(hashtext(${lockKey1}), hashtext(${lockKey2}))
    `;
  } catch (e: any) {
    console.warn("[executeBracket] advisory lock failed (continuing without lock)", {
      execKey: input.execKey,
      err: e?.message ? String(e.message) : String(e),
    });
  }

  try {
    if (Number.isFinite(maxOpenTrades) && maxOpenTrades > 0) {
      const openStatuses: any[] = [
        "INTENT_CREATED",
        "ORDER_SUBMITTED",
        "ORDER_ACCEPTED",
        "ORDER_FILLED",
        "BRACKET_SUBMITTED",
        "BRACKET_ACTIVE",
        "POSITION_OPEN",
      ];

      const openCount = await prisma.execution.count({
        where: {
          userId: input.userId,
          brokerName: input.brokerName,
          contractId: input.contractId,
          // include symbol match if symbol is set; otherwise ignore symbol
          ...(input.symbol ? { symbol: input.symbol } : {}),
          status: { in: openStatuses },
        },
      });

      if (openCount >= maxOpenTrades) {
        console.warn("[executeBracket] BLOCKED_MAX_OPEN_TRADES", {
          execKey: input.execKey,
          userId: input.userId,
          brokerName: input.brokerName,
          contractId: input.contractId,
          symbol: input.symbol ?? null,
          openCount,
          maxOpenTrades,
        });

        logTag("[executeBracket] BLOCKED_MAX_OPEN_TRADES", {
          execKey: input.execKey,
          userId: input.userId,
          brokerName: input.brokerName,
          contractId: input.contractId,
          symbol: input.symbol ?? null,
          openCount,
          maxOpenTrades,
        });

        throw new Error(`Blocked: max open trades reached (${openCount}/${maxOpenTrades})`);
      }
    }

  // --- REAL broker position guard (no DB-ghost blocking) ---
  // We try a few method names because adapters differ.
  const getPosFn =
    (broker as any).getPosition ??
    (broker as any).fetchPosition ??
    (broker as any).getOpenPosition ??
    null;

  if (typeof getPosFn === "function") {
    let pos: any = null;

    try {
      pos = await getPosFn.call(broker, {
        contractId: input.contractId,
        symbol: input.symbol ?? null,
      });
    } catch (e: any) {
      // Non-blocking if the POSITION CHECK call fails
      console.warn("[executeBracket] broker position check failed (non-blocking)", {
        execKey: input.execKey,
        err: e?.message ? String(e.message) : String(e),
      });
      pos = null;
    }

    if (pos) {
      const rawSize =
        pos?.size ??
        pos?.qty ??
        pos?.positionSize ??
        pos?.netQty ??
        pos?.netPosition ??
        0;

      const sizeNum = Number(rawSize);

      if (Number.isFinite(sizeNum) && sizeNum !== 0) {
        console.warn("[executeBracket] BLOCKED_BROKER_POSITION_OPEN", {
          execKey: input.execKey,
          userId: input.userId,
          brokerName: input.brokerName,
          contractId: input.contractId,
          symbol: input.symbol ?? null,
          brokerPositionSize: sizeNum,
        });

        logTag("[executeBracket] BLOCKED_BROKER_POSITION_OPEN", {
          execKey: input.execKey,
          userId: input.userId,
          brokerName: input.brokerName,
          contractId: input.contractId,
          symbol: input.symbol ?? null,
          brokerPositionSize: sizeNum,
        });

        throw new Error(`Blocked: broker reports open position (size=${sizeNum})`);
      }
    }
  } else {
    console.warn("[executeBracket] broker has no position-check method (non-blocking)", {
      execKey: input.execKey,
      broker: (broker as any)?.name ?? null,
    });
  }

  // Safety rail: clamp qty if maxContracts is provided
  const rawQty = Number(input.qty);
  const maxC = input.maxContracts != null ? Number(input.maxContracts) : null;

  const qtyClamped =
    Number.isFinite(rawQty) && rawQty > 0
      ? maxC != null && Number.isFinite(maxC) && maxC > 0
        ? Math.min(rawQty, maxC)
        : rawQty
      : rawQty;

  if (qtyClamped !== rawQty) {
    console.log("[executeBracket] QTY_CLAMPED_BY_MAX_CONTRACTS", {
      execKey: input.execKey,
      rawQty,
      maxContracts: maxC,
      qtyClamped,
    });
  }

  // ALWAYS use a short tag for broker calls (ProjectX can 500 on long tags)
  const brokerTag =
    input.customTag && input.customTag.trim().length > 0
      ? input.customTag.trim()
      : makeBrokerTag(input.execKey);

  // 1) Idempotency check
  const existing = await prisma.execution.findUnique({
    where: { execKey: input.execKey },
  });

  if (existing) {
    console.log("[executeBracket] IDEMPOTENT_HIT", {
      execKey: input.execKey,
      executionId: existing.id,
      status: existing.status,
      entryOrderId: existing.entryOrderId ?? null,
    });
    return existing;
  }

  // 2) Create intent row
  const exec = await prisma.execution.create({
    data: {
      execKey: input.execKey,
      userId: input.userId,
      brokerName: input.brokerName,
      contractId: input.contractId,
      symbol: input.symbol ?? null,
      side: input.side === "sell" ? OrderSide.SELL : OrderSide.BUY,
      qty: qtyClamped,
      entryType: input.entryType,
      stopLossTicks: input.stopLossTicks ?? null,
      takeProfitTicks: input.takeProfitTicks ?? null,
      customTag: brokerTag, // store the actual broker tag we used
      status: "INTENT_CREATED",
    },
  });

  // 3) Place ENTRY (always entry-only for ProjectX)
  const placeEntryFn = (broker as any).placeOrder;

  const entryReq = {
    contractId: input.contractId,
    side: input.side,
    size: qtyClamped,
    type: input.entryType,
    customTag: brokerTag,
  };

  console.log("[executeBracket] BROKER_CALL_BEGIN", {
    execKey: input.execKey,
    broker: (broker as any)?.name ?? null,
    mode: "ENTRY_ONLY_THEN_BRACKETS",
    req: entryReq,
  });

  try {
    if (typeof placeEntryFn !== "function") {
      const msg = "Broker does not support placeOrder (entry)";
      await prisma.execution.update({
        where: { id: exec.id },
        data: { status: "FAILED", error: msg },
      });
      throw new Error(msg);
    }

    const entryRes = await placeEntryFn.call(broker, entryReq);

    console.log("[executeBracket] BROKER_CALL_OK", {
      execKey: input.execKey,
      entryRes,
    });

    const entryOrderId = entryRes?.orderId != null ? String(entryRes.orderId) : null;

    const updatedAfterEntry = await prisma.execution.update({
      where: { id: exec.id },
      data: {
        entryOrderId,
        status: "ORDER_SUBMITTED",
        meta: { brokerResponse: jsonSafe(entryRes), note: "entry_submitted" },
      },
    });

    logTag("[projectx-worker] ORDER_SUBMITTED", {
      execKey: input.execKey,
      executionId: updatedAfterEntry.id,
      broker: (broker as any)?.name ?? null,
      contractId: input.contractId,
      symbol: input.symbol ?? null,
      side: input.side,
      qty: qtyClamped,
      entryType: input.entryType,
      stopLossTicks: input.stopLossTicks ?? null,
      takeProfitTicks: input.takeProfitTicks ?? null,
      entryOrderId,
      customTag: brokerTag,
    });

    // 4) Place SL/TP as a separate immediate step (ProjectX requirement)
    const sl = input.stopLossTicks != null ? Number(input.stopLossTicks) : null;
    const tp = input.takeProfitTicks != null ? Number(input.takeProfitTicks) : null;

    const wantsBrackets =
      (sl != null && Number.isFinite(sl) && sl > 0) ||
      (tp != null && Number.isFinite(tp) && tp > 0);

    const placeBracketsAfterEntryFn = (broker as any).placeBracketsAfterEntry;

    if (wantsBrackets) {
      if (typeof placeBracketsAfterEntryFn !== "function") {
        console.log("[executeBracket] BRACKETS_SKIPPED", {
          execKey: input.execKey,
          reason: "broker has no placeBracketsAfterEntry()",
          entryOrderId,
          sl,
          tp,
        });
        return updatedAfterEntry;
      }

      console.log("[executeBracket] BRACKETS_BEGIN", {
        execKey: input.execKey,
        entryOrderId,
        sl,
        tp,
      });

      const bracketRes = await placeBracketsAfterEntryFn.call(broker, {
        entryOrderId,
        contractId: input.contractId,
        side: input.side,
        size: qtyClamped,
        stopLossTicks: sl,
        takeProfitTicks: tp,
        customTag: brokerTag,
      });

      console.log("[executeBracket] BRACKETS_OK", {
        execKey: input.execKey,
        bracketRes,
      });

      const updatedAfterBrackets = await prisma.execution.update({
        where: { id: exec.id },
        data: {
          status: "BRACKET_SUBMITTED",
          stopOrderId: bracketRes?.stopOrderId != null ? String(bracketRes.stopOrderId) : null,
          tpOrderId:
            bracketRes?.takeProfitOrderId != null
              ? String(bracketRes.takeProfitOrderId)
              : null,
          meta: {
            ...(updatedAfterEntry.meta as any),
            brackets: jsonSafe(bracketRes),
            note2: "brackets_submitted_after_entry",
          },
        },
      });

      logTag("[projectx-worker] BRACKET_SUBMITTED", {
        execKey: input.execKey,
        executionId: updatedAfterBrackets.id,
        broker: (broker as any)?.name ?? null,
        contractId: input.contractId,
        side: input.side,
        qty: qtyClamped,
        stopLossTicks: sl,
        takeProfitTicks: tp,
        entryOrderId,
        customTag: brokerTag,
      });

      void ocoWatchAndCancel({
        broker,
        execKey: input.execKey,
        stopOrderId: updatedAfterBrackets.stopOrderId ?? null,
        tpOrderId: updatedAfterBrackets.tpOrderId ?? null,
        tag: brokerTag,
      });

      return updatedAfterBrackets;
    }

    return updatedAfterEntry;
  } catch (e: any) {
    const errMsg = e?.message ? String(e.message) : String(e);

    console.error("[executeBracket] FAIL", {
      execKey: input.execKey,
      err: errMsg,
      stack: e?.stack ? String(e.stack) : null,
    });

    await prisma.execution.update({
      where: { id: exec.id },
      data: {
        status: "FAILED",
        error: errMsg,
        meta: {
          brokerError: {
            message: errMsg,
            stack: e?.stack ? String(e.stack) : null,
          },
        },
      },
    });

    throw e;
  } finally {
    try {
      await prisma.$executeRaw`
        SELECT pg_advisory_unlock(hashtext(${lockKey1}), hashtext(${lockKey2}))
      `;
    } catch {
      // ignore
    }
  }
}
