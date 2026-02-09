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

  // 1) Idempotency check / create intent
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
    return existing; // hard stop: do NOT duplicate orders
  }

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

  // 2) Submit ENTRY ONLY (because Topstep Position Brackets mode requires 2-step)
  const placeEntryFn = (broker as any).placeOrder;
  const placeWithBracketsFn = (broker as any).placeOrderWithBrackets;

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
    mode: "ENTRY_ONLY",
    req: entryReq,
  });

  try {
    let res: any;

    if (typeof placeEntryFn === "function") {
      res = await placeEntryFn.call(broker, entryReq);
    } else if (typeof placeWithBracketsFn === "function") {
      // Fallback: call bracket method but force NO brackets
      res = await placeWithBracketsFn.call(broker, {
        ...entryReq,
        stopLossTicks: null,
        takeProfitTicks: null,
      });
    } else {
      const msg = "Broker does not support placeOrder or placeOrderWithBrackets";
      console.error("[executeBracket] UNSUPPORTED", {
        broker: (broker as any)?.name ?? null,
        msg,
      });
      await prisma.execution.update({
        where: { id: exec.id },
        data: { status: "FAILED", error: msg },
      });
      throw new Error(msg);
    }

    console.log("[executeBracket] BROKER_CALL_OK", {
      execKey: input.execKey,
      res,
    });

    const updated = await prisma.execution.update({
      where: { id: exec.id },
      data: {
        entryOrderId: res?.orderId != null ? String(res.orderId) : null,
        status: "ORDER_SUBMITTED",
        meta: { brokerResponse: res, note: "entry_only" },
      },
    });

    console.log("[executeBracket] EXEC_UPDATED", {
      execKey: input.execKey,
      executionId: updated.id,
      status: updated.status,
      entryOrderId: updated.entryOrderId ?? null,
    });

    logTag("[projectx-worker] ORDER_SUBMITTED", {
      execKey: input.execKey,
      executionId: updated.id,
      broker: (broker as any)?.name ?? null,
      contractId: input.contractId,
      symbol: input.symbol ?? null,
      side: input.side,
      qty: input.qty,
      entryType: input.entryType,
      // We are intentionally NOT submitting brackets in this mode:
      stopLossTicks: null,
      takeProfitTicks: null,
      entryOrderId: updated.entryOrderId ?? null,
    });

    return updated;
  } catch (e: any) {
    const errMsg = e?.message ? String(e.message) : String(e);
    console.error("[executeBracket] BROKER_CALL_FAIL", {
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
