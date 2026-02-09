// worker/src/execution/executeBracket.ts

import { PrismaClient, OrderSide } from "@prisma/client";
import type { IBrokerAdapter } from "../broker/IBrokerAdapter.js";
import { logTag } from "../lib/logTags";

export type ExecuteBracketInput = {
  execKey: string;
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

  /* ------------------------------------------------------------------ */
  /* 1) Idempotency                                                      */
  /* ------------------------------------------------------------------ */

  const existing = await prisma.execution.findUnique({
    where: { execKey: input.execKey },
  });

  if (existing) {
    console.log("[executeBracket] IDEMPOTENT_HIT", {
      execKey: input.execKey,
      executionId: existing.id,
      status: existing.status,
    });
    return existing;
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

  const placeOrder = (broker as any).placeOrder;
  if (typeof placeOrder !== "function") {
    throw new Error("Broker does not support placeOrder()");
  }

  /* ------------------------------------------------------------------ */
  /* 2) ENTRY                                                           */
  /* ------------------------------------------------------------------ */

  const entryRes = await placeOrder.call(broker, {
    contractId: input.contractId,
    side: input.side,
    size: input.qty,
    type: input.entryType,
    customTag: input.customTag ?? input.execKey,
  });

  const entryOrderId = String(entryRes.orderId);

  await prisma.execution.update({
    where: { id: exec.id },
    data: {
      entryOrderId,
      status: "ENTRY_SUBMITTED",
    },
  });

  logTag("[projectx-worker] ENTRY_SUBMITTED", {
    execKey: input.execKey,
    entryOrderId,
  });

  /* ------------------------------------------------------------------ */
  /* 3) STOP LOSS (separate order)                                      */
  /* ------------------------------------------------------------------ */

  if (input.stopLossTicks && input.stopLossTicks > 0) {
    await placeOrder.call(broker, {
      contractId: input.contractId,
      side: input.side === "buy" ? "sell" : "buy",
      size: input.qty,
      type: "stop",
      stopPrice: Math.abs(input.stopLossTicks),
      customTag: `sl:${entryOrderId}`,
    });
  }

  /* ------------------------------------------------------------------ */
  /* 4) TAKE PROFIT (separate order)                                    */
  /* ------------------------------------------------------------------ */

  if (input.takeProfitTicks && input.takeProfitTicks > 0) {
    await placeOrder.call(broker, {
      contractId: input.contractId,
      side: input.side === "buy" ? "sell" : "buy",
      size: input.qty,
      type: "limit",
      limitPrice: Math.abs(input.takeProfitTicks),
      customTag: `tp:${entryOrderId}`,
    });
  }

  /* ------------------------------------------------------------------ */
  /* 5) Final state                                                     */
  /* ------------------------------------------------------------------ */

  const finalExec = await prisma.execution.update({
    where: { id: exec.id },
    data: {
      status: "BRACKET_SUBMITTED",
    },
  });

  logTag("[projectx-worker] BRACKET_SUBMITTED", {
    execKey: input.execKey,
    entryOrderId,
    stopLossTicks: input.stopLossTicks ?? null,
    takeProfitTicks: input.takeProfitTicks ?? null,
  });

  return finalExec;
}
