// worker/src/execution/executeBracket.ts
import { PrismaClient, OrderSide } from "@prisma/client";
import type { IBrokerAdapter } from "../broker/IBrokerAdapter.js";
import { logTag } from "../lib/logTags";
import { createHash } from "crypto";
import { emitExecEvent } from "./execEvents.js";

export type ExecuteBracketInput = {
  execKey: string; // deterministic idempotency key
  userId: string; // internal UserProfile.id
  brokerAccountId: string; // ✅ REQUIRED (Option B)
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

  // absolute prices from strategy (preferred)
  stopPrice?: number | null;
  takeProfitPrice?: number | null;

  customTag?: string | null;
};

function jsonSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function makeBrokerTag(execKey: string): string {
  const h = createHash("sha1").update(execKey).digest("hex").slice(0, 8);
  return `aura-${h}`;
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
  const timeoutMs = 10 * 60 * 1000;
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

  const { prisma, broker, input } = params;

  // -------------------------
  // Run-state source of truth (DB) - PER ACCOUNT (Option B)
  // -------------------------
  const runState = await prisma.brokerAccount.findFirst({
    where: { id: input.brokerAccountId, userId: input.userId },
    select: { isPaused: true, isKillSwitched: true, killSwitchedAt: true, config: true },
  });

  // Optional global gates (“pause everything” / “kill everything”)
  const globalState = await prisma.userTradingState.findUnique({
    where: { userId: input.userId },
    select: { isPaused: true, isKillSwitched: true, killSwitchedAt: true },
  });

  if (!runState) {
    await emitExecEvent({
      prisma,
      userId: input.userId,
      brokerAccountId: input.brokerAccountId,
      type: "exec.broker_blocked",
      message: "Blocked: broker account not found for user",
      data: {
        execKey: input.execKey,
        brokerAccountId: input.brokerAccountId,
        brokerName: input.brokerName,
      },
      level: "warn",
    });

    throw new Error("Blocked: broker account not found");
  }

  const killActive = Boolean(runState.isKillSwitched) || Boolean(globalState?.isKillSwitched);
  const pausedActive = Boolean(runState.isPaused) || Boolean(globalState?.isPaused);

  if (killActive) {
    await emitExecEvent({
      prisma,
      userId: input.userId,
      brokerAccountId: input.brokerAccountId,
      type: "exec.broker_blocked",
      message: "Blocked: kill switch active",
      data: {
        execKey: input.execKey,
        brokerAccountId: input.brokerAccountId,
        brokerName: input.brokerName,
        contractId: input.contractId,
        symbol: input.symbol ?? null,
        killSwitchedAt:
          runState.killSwitchedAt?.toISOString?.() ??
          (globalState?.killSwitchedAt?.toISOString?.() ?? null),
      },
      level: "warn",
    });

    throw new Error("Blocked: kill switch active");
  }

  if (pausedActive) {
    await emitExecEvent({
      prisma,
      userId: input.userId,
      brokerAccountId: input.brokerAccountId,
      type: "exec.broker_blocked",
      message: "Blocked: trading paused",
      data: {
        execKey: input.execKey,
        brokerAccountId: input.brokerAccountId,
        brokerName: input.brokerName,
        contractId: input.contractId,
        symbol: input.symbol ?? null,
      },
      level: "warn",
    });

    throw new Error("Blocked: trading paused");
  }

  await emitExecEvent({
    prisma,
    userId: input.userId,
    brokerAccountId: input.brokerAccountId,
    type: "exec.requested",
    message: "executeBracket requested",
    data: {
      execKey: input.execKey,
      brokerAccountId: input.brokerAccountId,
      broker: (broker as any)?.name ?? null,
      brokerName: input.brokerName,
      contractId: input.contractId,
      symbol: input.symbol ?? null,
      side: input.side,
      qty: input.qty,
      entryType: input.entryType,
    },
  });

  const resolvedSymbol = input.symbol ?? input.contractId ?? null;

  // --- MAX OPEN TRADES (DB guard) + anti-double-click lock ---
  const cfg = (runState.config as any) ?? null;

  const maxOpenTradesParsed =
    cfg?.maxOpenTrades != null && Number.isFinite(Number(cfg.maxOpenTrades))
      ? Math.max(1, Math.floor(Number(cfg.maxOpenTrades)))
      : 1;

  // v1 policy: forced to 1 for now (UI shows it; later you can unlock)
  const maxOpenTrades = 1;

  const lockKey1 = `aura:${input.userId}:${input.brokerAccountId}`;
  const lockKey2 = `openTrade:${input.brokerName}:${input.contractId}:${resolvedSymbol ?? ""}`;

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
    // --- REAL broker position guard ---
    const getPosFn =
      (broker as any).getPosition ??
      (broker as any).fetchPosition ??
      (broker as any).getOpenPosition ??
      null;

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

    // --- Auto-cancel stale ghosts if broker check succeeded AND broker is flat ---
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
            brokerAccountId: input.brokerAccountId,
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
          brokerAccountId: input.brokerAccountId,
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
          maxOpenTradesParsed,
        });

        logTag("[executeBracket] BLOCKED_MAX_OPEN_TRADES", {
          execKey: input.execKey,
          userId: input.userId,
          brokerName: input.brokerName,
          contractId: input.contractId,
          symbol: input.symbol ?? null,
          openCount,
          maxOpenTrades,
          maxOpenTradesParsed,
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

      await emitExecEvent({
        prisma,
        userId: input.userId,
        brokerAccountId: input.brokerAccountId,
        executionId: existing.id,
        type: "exec.duplicate_ignored",
        message: "Idempotent hit - existing execution returned",
        data: {
          execKey: input.execKey,
          status: existing.status,
          entryOrderId: existing.entryOrderId ?? null,
          stopOrderId: existing.stopOrderId ?? null,
          tpOrderId: existing.tpOrderId ?? null,
        },
        level: "warn",
      });

      return existing;
    }

    // 2) Create intent row
    const exec = await prisma.execution.create({
      data: {
        execKey: input.execKey,
        userId: input.userId,
        brokerAccountId: input.brokerAccountId,
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

    await emitExecEvent({
      prisma,
      userId: input.userId,
      brokerAccountId: input.brokerAccountId,
      executionId: exec.id,
      type: "exec.intent_created",
      message: "Execution intent created",
      data: { execKey: input.execKey },
    });

    // Place entry + brackets using normalized broker interface
    try {
      const result = await (broker as any).placeBracketOrder({
        contractId: input.contractId,
        symbol: resolvedSymbol,
        side: input.side,
        size: qtyClamped,
        entryType: input.entryType,
        stopLossTicks: input.stopLossTicks ?? null,
        takeProfitTicks: input.takeProfitTicks ?? null,
        stopPrice: input.stopPrice ?? null,
        takeProfitPrice: input.takeProfitPrice ?? null,
        customTag: brokerTag,
      });

      const updated = await prisma.execution.update({
        where: { id: exec.id },
        data: {
          entryOrderId: result?.entryOrderId ?? null,
          stopOrderId: result?.stopOrderId ?? null,
          tpOrderId: result?.takeProfitOrderId ?? null,
          status: "BRACKET_SUBMITTED",
          meta: { brokerResponse: jsonSafe(result?.raw) },
        },
      });

      await emitExecEvent({
        prisma,
        userId: input.userId,
        brokerAccountId: input.brokerAccountId,
        executionId: updated.id,
        type: "exec.brackets_submitted",
        message: "Entry and exits submitted to broker",
        data: {
          execKey: input.execKey,
          entryOrderId: updated.entryOrderId ?? null,
          stopOrderId: updated.stopOrderId ?? null,
          tpOrderId: updated.tpOrderId ?? null,
        },
      });

      logTag("[execution] BRACKET_SUBMITTED", {
        execKey: input.execKey,
        executionId: updated.id,
        broker: (broker as any).name,
        contractId: input.contractId,
        side: input.side,
        qty: qtyClamped,
        entryOrderId: updated.entryOrderId ?? null,
      });

      void ocoWatchAndCancel({
        broker,
        execKey: input.execKey,
        stopOrderId: updated.stopOrderId ?? null,
        tpOrderId: updated.tpOrderId ?? null,
        tag: brokerTag,
      });

      await emitExecEvent({
        prisma,
        userId: input.userId,
        brokerAccountId: input.brokerAccountId,
        executionId: updated.id,
        type: "exec.oco_watch_started",
        message: "OCO watcher started",
        data: { execKey: input.execKey },
      });

      return updated;
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

      await emitExecEvent({
        prisma,
        userId: input.userId,
        brokerAccountId: input.brokerAccountId,
        executionId: exec.id,
        type: "exec.failed",
        message: "Execution failed",
        data: { execKey: input.execKey, error: errMsg },
        level: "error",
      });

      throw e;
    }
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
