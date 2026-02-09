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
      customTag: input.customTag ?? null,
      status: "INTENT_CREATED",
    },
  });

  // 3) Place ENTRY (always entry-only for ProjectX)
  const placeEntryFn = (broker as any).placeOrder;

  const entryReq = {
    contractId: input.contractId,
    side: input.side,
    size: input.qty,
    type: input.entryType,
    customTag: input.customTag ?? input.execKey,
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
        size: input.qty,
        stopLossTicks: sl,
        takeProfitTicks: tp,
        customTag: input.customTag ?? "manual",
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
