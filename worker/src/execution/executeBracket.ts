// worker/src/execution/executeBracket.ts

import { PrismaClient, OrderSide } from "@prisma/client";
import type { IBrokerAdapter } from "../broker/IBrokerAdapter.js";
import { logTag } from "../lib/logTags";

export type ExecuteBracketInput = {
  execKey: string; // deterministic idempotency key
  userId: string;
  brokerName: string;

  contractId: string;
  symbol?: string | null;

  side: "buy" | "sell";
  qty: number;
  entryType: "market" | "limit" | "stop";

  stopLossTicks?: number | null;
  takeProfitTicks?: number | null;

  customTag?: string | null;
};

// Small, deterministic hash so tags stay SHORT and stable.
// (ProjectX can behave badly with long / complex tags; and tags must be unique per account.)
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5; // 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // 16777619
  }
  // Convert to unsigned 32-bit hex
  return (h >>> 0).toString(16).padStart(8, "0");
}

function buildSafeProjectXTag(execKey: string): string {
  // Keep it short, alnum + a couple safe chars, unique per execKey.
  // Example: aura-1a2b3c4d
  return `aura-${fnv1aHex(execKey)}`;
}

export async function executeBracket(params: {
  prisma: PrismaClient;
  broker: IBrokerAdapter;
  input: ExecuteBracketInput;
}) {
  const { prisma, broker, input } = params;

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

  // Always use a short, deterministic tag for ProjectX.
  // We do NOT trust user-provided tags (e.g. "manual") because:
  // - tags must be unique per account
  // - long tags have triggered ProjectX HTTP 500 (empty body) in your logs
  const safeCustomTag = buildSafeProjectXTag(input.execKey);

  // 2) Create intent row
  const exec = await prisma.execution.create({
    data: {
      execKey: input.execKey,
      userId: input.userId,
      brokerName: input.brokerName,
      contractId: input.contractId,
      symbol: input.symbol ?? null,
      side: input.side === "sell" ? OrderSide.SELL : OrderSide.BUY,
      qty: input.qty,
      entryType: input.entryType,
      stopLossTicks: input.stopLossTicks ?? null,
      takeProfitTicks: input.takeProfitTicks ?? null,
      customTag: safeCustomTag,
      status: "INTENT_CREATED",
    },
  });

  // 3) Place ENTRY (ENTRY MUST NOT include SL/TP fields for ProjectX)
  const placeEntryFn = (broker as any).placeOrder;

  const entryReq: Record<string, unknown> = {
    contractId: input.contractId,
    side: input.side,
    size: input.qty,
    type: input.entryType,
    // Keep tag short + safe
    customTag: safeCustomTag,
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

    const entryOrderId =
      entryRes?.orderId != null ? String(entryRes.orderId) : null;

    const updatedAfterEntry = await prisma.execution.update({
      where: { id: exec.id },
      data: {
        entryOrderId,
        status: "ORDER_SUBMITTED",
        meta: { brokerResponse: entryRes, note: "entry_submitted" },
      },
    });

    logTag("[projectx-worker] ORDER_SUBMITTED", {
      execKey: input.execKey,
      executionId: updatedAfterEntry.id,
      broker: (broker as any)?.name ?? null,
      contractId: input.contractId,
      symbol: input.symbol ?? null,
      side: input.side,
      qty: input.qty,
      entryType: input.entryType,
      stopLossTicks: input.stopLossTicks ?? null,
      takeProfitTicks: input.takeProfitTicks ?? null,
      entryOrderId: entryOrderId,
      customTag: safeCustomTag,
    });

    // 4) Place SL/TP as a separate immediate step (ProjectX requirement)
    const sl =
      input.stopLossTicks != null ? Number(input.stopLossTicks) : null;
    const tp =
      input.takeProfitTicks != null ? Number(input.takeProfitTicks) : null;

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
        customTag: safeCustomTag,
      });

      const bracketRes = await placeBracketsAfterEntryFn.call(broker, {
        entryOrderId,
        contractId: input.contractId,
        side: input.side,
        size: input.qty,
        stopLossTicks: sl,
        takeProfitTicks: tp,
        // Keep same safe tag for downstream correlation
        customTag: safeCustomTag,
      });

      console.log("[executeBracket] BRACKETS_OK", {
        execKey: input.execKey,
        bracketRes,
      });

      const updatedAfterBrackets = await prisma.execution.update({
        where: { id: exec.id },
        data: {
          status: "BRACKETS_SUBMITTED",
          meta: {
            ...(updatedAfterEntry.meta as any),
            brackets: bracketRes,
            note2: "brackets_submitted_after_entry",
          },
        },
      });

      logTag("[projectx-worker] BRACKETS_SUBMITTED", {
        execKey: input.execKey,
        executionId: updatedAfterBrackets.id,
        broker: (broker as any)?.name ?? null,
        contractId: input.contractId,
        side: input.side,
        qty: input.qty,
        stopLossTicks: sl,
        takeProfitTicks: tp,
        entryOrderId,
        customTag: safeCustomTag,
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
  }
}
