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

  // NEW: absolute prices from strategy (preferred)
  stopPrice?: number | null;
  takeProfitPrice?: number | null;

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

function normalizeStopTicks(params: {
  side: "buy" | "sell";
  ticks: number;
  requiresSigned: boolean;
}): number {
  const t = Number(params.ticks);
  if (!Number.isFinite(t) || t <= 0) {
    throw new Error(`executeBracket: invalid stopLossTicks ${String(params.ticks)}`);
  }

  if (!params.requiresSigned) return Math.abs(t);

  // ProjectX expects signed ticks relative to side
  return params.side === "buy" ? Math.abs(t) : -Math.abs(t);
}

function normalizeTakeProfitTicks(params: {
  side: "buy" | "sell";
  ticks: number;
  requiresSigned: boolean;
}): number {
  const t = Number(params.ticks);
  if (!Number.isFinite(t) || t <= 0) {
    throw new Error(`executeBracket: invalid takeProfitTicks ${String(params.ticks)}`);
  }

  if (!params.requiresSigned) return Math.abs(t);

  // ProjectX expects signed ticks relative to side
  return params.side === "buy" ? Math.abs(t) : -Math.abs(t);
}

export async function executeBracket(params: {
  prisma: PrismaClient;
  broker: IBrokerAdapter;
  input: ExecuteBracketInput;
}) {
  const caps = (params.broker as any)?.capabilities as
    | {
        supportsBracketInSingleCall: boolean;
        supportsAttachBracketsAfterEntry: boolean;
        requiresSignedBracketTicks: boolean;
      }
    | undefined;

  if (!caps) {
    throw new Error(
      `executeBracket: broker missing capabilities (broker=${(params.broker as any)?.name ?? "unknown"})`
    );
  }

  const canFlowA =
    caps.supportsBracketInSingleCall &&
    typeof (params.broker as any).placeOrderWithBrackets === "function";

  const canFlowB =
    caps.supportsAttachBracketsAfterEntry &&
    typeof (params.broker as any).placeOrder === "function" &&
    typeof (params.broker as any).placeBracketsAfterEntry === "function";

  if (!canFlowA && !canFlowB) {
    throw new Error(
      `executeBracket: broker does not support bracket execution flow A or B (broker=${(params.broker as any)?.name ?? "unknown"})`
    );
  }

  const { prisma, broker, input } = params;
  const resolvedSymbol = (input.symbol ?? input.contractId ?? null);

  // --- MAX OPEN TRADES (DB guard) + anti-double-click lock ---
  const maxOpenTrades =
    process.env.AURA_MAX_OPEN_TRADES != null ? Number(process.env.AURA_MAX_OPEN_TRADES) : 1;

  const lockKey1 = `aura:${input.userId}`;
  const lockKey2 = `openTrade:${input.brokerName}:${input.contractId}:${resolvedSymbol ?? ""}`;

  // Acquire lock (best-effort)
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
    // --- REAL broker position guard (no DB-ghost blocking) ---
    // We try a few method names because adapters differ.
    const getPosFn =
      (broker as any).getPosition ?? (broker as any).fetchPosition ?? (broker as any).getOpenPosition ?? null;

    let brokerHasOpenPosition = false;
    let brokerPositionSize: number | null = null;
    let brokerPosCheckOk = false;

    if (typeof getPosFn === "function") {
      try {
        const pos = await getPosFn.call(broker, {
          contractId: input.contractId,
          symbol: resolvedSymbol,
        });

        const rawSize =
          pos?.size ?? pos?.qty ?? pos?.positionSize ?? pos?.netQty ?? pos?.netPosition ?? 0;

        const sizeNum = Number(rawSize);

        brokerPosCheckOk = true;
        brokerPositionSize = Number.isFinite(sizeNum) ? sizeNum : 0;
        brokerHasOpenPosition = Number.isFinite(sizeNum) && sizeNum !== 0;

        if (brokerHasOpenPosition) {
          console.warn("[executeBracket] BLOCKED_BROKER_POSITION_OPEN", {
            execKey: input.execKey,
            userId: input.userId,
            brokerName: input.brokerName,
            contractId: input.contractId,
            symbol: resolvedSymbol,
            brokerPositionSize: sizeNum,
          });

          logTag("[executeBracket] BLOCKED_BROKER_POSITION_OPEN", {
            execKey: input.execKey,
            userId: input.userId,
            brokerName: input.brokerName,
            contractId: input.contractId,
            symbol: resolvedSymbol,
            brokerPositionSize: sizeNum,
          });

          throw new Error(`Blocked: broker reports open position (size=${sizeNum})`);
        }
      } catch (e: any) {
        // Non-blocking if the position check fails
        console.warn("[executeBracket] broker position check failed (non-blocking)", {
          execKey: input.execKey,
          err: e?.message ? String(e.message) : String(e),
        });
      }
    } else {
      console.warn("[executeBracket] broker has no position-check method (non-blocking)", {
        execKey: input.execKey,
        broker: (broker as any)?.name ?? null,
      });
    }

    // --- If broker is flat, auto-cancel stale "ghost" open executions so they can't block forever ---
    // This is ONLY done when broker position check succeeded AND broker is flat.
    // (If we cannot verify broker flat, we do not auto-cancel anything.)
    const ghostTtlMinutes =
      process.env.AURA_GHOST_EXEC_TTL_MINUTES != null
        ? Number(process.env.AURA_GHOST_EXEC_TTL_MINUTES)
        : 2;

    const shouldGhostClean =
      brokerPosCheckOk &&
      !brokerHasOpenPosition &&
      Number.isFinite(ghostTtlMinutes) &&
      ghostTtlMinutes > 0;

    if (shouldGhostClean) {
      const staleBefore = new Date(Date.now() - ghostTtlMinutes * 60 * 1000);

      // These are the statuses that frequently get stuck and block users.
      // Note: We INCLUDE ORDER_FILLED here for cleanup purposes (but we do NOT count it as "open" below).
      const ghostStatuses: any[] = [
        "INTENT_CREATED",
        "ORDER_SUBMITTED",
        "ORDER_ACCEPTED",
        "ORDER_FILLED",
        "BRACKET_SUBMITTED",
        "BRACKET_ACTIVE",
        "POSITION_OPEN",
      ];

      try {
        const res = await prisma.execution.updateMany({
          where: {
            userId: input.userId,
            brokerName: input.brokerName,
            contractId: input.contractId,
            ...(resolvedSymbol ? { symbol: resolvedSymbol } : {}),
            status: { in: ghostStatuses },
            updatedAt: { lt: staleBefore },
          },
          data: {
            status: "CANCELLED",
            error: "auto-cancel: broker flat (db ghost)",
          },
        });

        if (res.count > 0) {
          console.warn("[executeBracket] AUTO_CANCELLED_GHOST_EXECUTIONS", {
            execKey: input.execKey,
            userId: input.userId,
            brokerName: input.brokerName,
            contractId: input.contractId,
            symbol: input.symbol ?? null,
            cancelledCount: res.count,
            ghostTtlMinutes,
            brokerPositionSize,
          });

          logTag("[executeBracket] AUTO_CANCELLED_GHOST_EXECUTIONS", {
            execKey: input.execKey,
            userId: input.userId,
            brokerName: input.brokerName,
            contractId: input.contractId,
            symbol: input.symbol ?? null,
            cancelledCount: res.count,
            ghostTtlMinutes,
            brokerPositionSize,
          });
        }
      } catch (e: any) {
        console.warn("[executeBracket] ghost cleanup failed (non-blocking)", {
          execKey: input.execKey,
          err: e?.message ? String(e.message) : String(e),
        });
      }
    }

    // 0) Max open trades guard (DB)
    // IMPORTANT: DO NOT treat ORDER_FILLED as "open" here.
    // If the broker is actually still in a position, the broker guard above blocks it.
    // If broker is flat, ORDER_FILLED rows can exist transiently and must not block forever.
    if (Number.isFinite(maxOpenTrades) && maxOpenTrades > 0) {
      const openStatuses: any[] = [
        "INTENT_CREATED",
        "ORDER_SUBMITTED",
        "ORDER_ACCEPTED",
        "BRACKET_SUBMITTED",
        "BRACKET_ACTIVE",
        "POSITION_OPEN",
      ];

      const openCount = await prisma.execution.count({
        where: {
          userId: input.userId,
          brokerName: input.brokerName,
          contractId: input.contractId,
          ...(resolvedSymbol ? { symbol: resolvedSymbol } : {}),
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
      input.customTag && input.customTag.trim().length > 0 ? input.customTag.trim() : makeBrokerTag(input.execKey);

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
        symbol: resolvedSymbol,
        side: input.side === "sell" ? OrderSide.SELL : OrderSide.BUY,
        qty: qtyClamped,
        entryType: input.entryType,
        stopLossTicks: input.stopLossTicks ?? null,
        takeProfitTicks: input.takeProfitTicks ?? null,
        customTag: brokerTag,
        status: "INTENT_CREATED",
      },
    });

    // -------------------------
    // Place entry + brackets using capabilities
    // -------------------------
    try {
      if (canFlowA) {
      // Flow A: broker supports single call (entry + brackets)
      const placeWithBracketsFn = (broker as any).placeOrderWithBrackets;

      const slRaw = input.stopLossTicks != null ? Number(input.stopLossTicks) : null;
      const tpRaw = input.takeProfitTicks != null ? Number(input.takeProfitTicks) : null;

      const sl =
        slRaw != null && Number.isFinite(slRaw) && slRaw > 0
          ? normalizeStopTicks({
              side: input.side,
              ticks: slRaw,
              requiresSigned: caps.requiresSignedBracketTicks,
            })
          : null;

      const tp =
        tpRaw != null && Number.isFinite(tpRaw) && tpRaw > 0
          ? normalizeTakeProfitTicks({
              side: input.side,
              ticks: tpRaw,
              requiresSigned: caps.requiresSignedBracketTicks,
            })
          : null;

      const wantsBrackets = sl != null || tp != null;

      const req = {
        contractId: input.contractId,
        symbol: resolvedSymbol,
        side: input.side,
        size: qtyClamped,
        type: input.entryType,
        limitPrice: null,
        stopPrice: null,
        stopLossTicks: wantsBrackets ? sl : null,
        takeProfitTicks: wantsBrackets ? tp : null,
        customTag: brokerTag,

        // NEW: absolute prices (optional, broker may ignore)
        stopPriceAbs: input.stopPrice ?? null,
        takeProfitPriceAbs: input.takeProfitPrice ?? null,
      };

      console.log("[executeBracket] BROKER_CALL_BEGIN", {
        execKey: input.execKey,
        broker: (broker as any)?.name ?? null,
        mode: "FLOW_A_SINGLE_CALL",
        req,
      });

      if (typeof placeWithBracketsFn !== "function") {
        const msg = "Broker does not support placeOrderWithBrackets (Flow A)";
        await prisma.execution.update({
          where: { id: exec.id },
          data: { status: "FAILED", error: msg },
        });
        throw new Error(msg);
      }

      const res = await placeWithBracketsFn.call(broker, req);

      console.log("[executeBracket] BROKER_CALL_OK", {
        execKey: input.execKey,
        res,
      });

      const entryOrderId = res?.orderId != null ? String(res.orderId) : null;

      const updated = await prisma.execution.update({
        where: { id: exec.id },
        data: {
          entryOrderId,
          status: "BRACKET_SUBMITTED",
          stopOrderId: res?.stopOrderId != null ? String(res.stopOrderId) : null,
          tpOrderId: res?.takeProfitOrderId != null ? String(res.takeProfitOrderId) : null,
          meta: { brokerResponse: jsonSafe(res), note: "flow_a_single_call" },
        },
      });

      logTag("[projectx-worker] BRACKET_SUBMITTED", {
        execKey: input.execKey,
        executionId: updated.id,
        broker: (broker as any)?.name ?? null,
        contractId: input.contractId,
        side: input.side,
        qty: qtyClamped,
        stopLossTicks: input.stopLossTicks ?? null,
        takeProfitTicks: input.takeProfitTicks ?? null,
        entryOrderId,
        customTag: brokerTag,
      });

      // Optional OCO watcher if broker doesn't guarantee OCO
      void ocoWatchAndCancel({
        broker,
        execKey: input.execKey,
        stopOrderId: updated.stopOrderId ?? null,
        tpOrderId: updated.tpOrderId ?? null,
        tag: brokerTag,
      });

      return updated;
    }

    // Flow B: entry first, then attach brackets
    const placeEntryFn = (broker as any).placeOrder;

    const entryReq = {
      contractId: input.contractId,
      symbol: resolvedSymbol,
      side: input.side,
      size: qtyClamped,
      type: input.entryType,
      customTag: brokerTag,
    };

    console.log("[executeBracket] BROKER_CALL_BEGIN", {
      execKey: input.execKey,
      broker: (broker as any)?.name ?? null,
      mode: "FLOW_B_ENTRY_THEN_BRACKETS",
      req: entryReq,
    });

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
      symbol: resolvedSymbol,
      side: input.side,
      qty: qtyClamped,
      entryType: input.entryType,
      stopLossTicks: input.stopLossTicks ?? null,
      takeProfitTicks: input.takeProfitTicks ?? null,
      entryOrderId,
      customTag: brokerTag,
    });

    const slRaw = input.stopLossTicks != null ? Number(input.stopLossTicks) : null;
    const tpRaw = input.takeProfitTicks != null ? Number(input.takeProfitTicks) : null;

    const sl =
      slRaw != null && Number.isFinite(slRaw) && slRaw > 0
        ? normalizeStopTicks({
            side: input.side,
            ticks: slRaw,
            requiresSigned: caps.requiresSignedBracketTicks,
          })
        : null;

    const tp =
      tpRaw != null && Number.isFinite(tpRaw) && tpRaw > 0
        ? normalizeTakeProfitTicks({
            side: input.side,
            ticks: tpRaw,
            requiresSigned: caps.requiresSignedBracketTicks,
          })
        : null;

    const wantsBrackets = sl != null || tp != null;

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

        // absolute prices (optional)
        stopPrice: input.stopPrice ?? null,
        takeProfitPrice: input.takeProfitPrice ?? null,

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
            bracketRes?.takeProfitOrderId != null ? String(bracketRes.takeProfitOrderId) : null,
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
        stopLossTicks: input.stopLossTicks ?? null,
        takeProfitTicks: input.takeProfitTicks ?? null,
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
              stack: e?.stack ? String(e.stack) : String(e),
            },
          },
        },
      });

      throw e;
    }
  } finally {
    // Always attempt unlock
    try {
      await prisma.$executeRaw`
        SELECT pg_advisory_unlock(hashtext(${lockKey1}), hashtext(${lockKey2}))
      `;
    } catch {
      // ignore
    }
  }
}
