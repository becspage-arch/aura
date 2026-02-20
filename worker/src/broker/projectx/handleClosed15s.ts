// worker/src/broker/projectx/handleClosed15s.ts

import type { PrismaClient } from "@prisma/client";
import { Prisma, OrderSide } from "@prisma/client";

import type { CorePlus315Engine } from "../../strategy/coreplus315Engine.js";
import { buildBracketFromIntent } from "../../trading/buildBracket.js";
import { executeBracket } from "../../execution/executeBracket.js";
import { logTag } from "../../lib/logTags";

export type HandleClosed15sDeps = {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  broker: any;

  getPrisma: () => PrismaClient;

  emitSafe: (event: {
    name: string;
    ts: string;
    broker: string;
    data?: Record<string, unknown>;
  }) => Promise<void>;

  getUserTradingState: () => Promise<{ isPaused: boolean; isKillSwitched: boolean }>;
  getUserIdentityForWorker: () => Promise<{ clerkUserId: string; userId: string }>;
  getStrategyEnabledForAccount: (params: {
    brokerName: string;
    externalAccountId: string;
  }) => Promise<boolean>;

  strategy: CorePlus315Engine | null;

  status: any;

  // mutable state owned by ProjectX start-up
  rolloverOkLoggedRef: { value: boolean };
};

function toDec(n: number | null | undefined) {
  if (n == null) return null;
  if (!Number.isFinite(Number(n))) return null;
  return new Prisma.Decimal(Number(n));
}

function makeSignalKey(params: {
  strategy: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  entryTime: number;
  fvgTime: number;
}) {
  // Deterministic and stable across restarts
  return `${params.strategy}:${params.userId}:${params.symbol}:${params.side}:${params.entryTime}:${params.fvgTime}`;
}

async function backfillMissing15sCandles(params: {
  db: PrismaClient;
  symbol: string;
  currentTime: number; // current candle open-time in seconds
  emitSafe: HandleClosed15sDeps["emitSafe"];
  brokerNameForEvent: string;
}) {
  const { db, symbol, currentTime, emitSafe, brokerNameForEvent } = params;

  // Find the most recent candle strictly before the current one
  const prev = await db.candle15s.findFirst({
    where: { symbol, time: { lt: currentTime } },
    orderBy: { time: "desc" },
    select: { time: true, close: true },
  });

  if (!prev) return;

  const gap = currentTime - prev.time;
  if (gap <= 15) return;

  // Use last known close as a flat filler (O=H=L=C)
  const fillPrice = Number(prev.close);

  for (let t = prev.time + 15; t < currentTime; t += 15) {
    await db.candle15s.upsert({
      where: { symbol_time: { symbol, time: t } },
      create: {
        symbol,
        time: t,
        open: fillPrice,
        high: fillPrice,
        low: fillPrice,
        close: fillPrice,
      },
      update: {
        open: fillPrice,
        high: fillPrice,
        low: fillPrice,
        close: fillPrice,
      },
    });

    // Emit a close event for downstream (3m builder / UI / Ably later)
    // Marked clearly as backfill so nothing trades on it.
    await emitSafe({
      name: "candle.15s.closed",
      ts: new Date().toISOString(),
      broker: brokerNameForEvent,
      data: {
        t0: t * 1000,
        o: fillPrice,
        h: fillPrice,
        l: fillPrice,
        c: fillPrice,
        ticks: 0,
        backfill: true,
      },
    });
  }
}

async function hasOpenTrade(params: {
  db: PrismaClient;
  userId: string;
  brokerName: string;
  contractId: string;
  symbol?: string | null;
}) {
  const openStatuses: any[] = [
    "INTENT_CREATED",
    "ORDER_SUBMITTED",
    "ORDER_ACCEPTED",
    // IMPORTANT: DO NOT include ORDER_FILLED (can be a DB ghost while broker is flat)
    "BRACKET_SUBMITTED",
    "BRACKET_ACTIVE",
    "POSITION_OPEN",
  ];

  const openCount = await params.db.execution.count({
    where: {
      userId: params.userId,
      brokerName: params.brokerName,
      contractId: params.contractId,
      ...(params.symbol ? { symbol: params.symbol } : {}),
      status: { in: openStatuses },
    },
  });

  return openCount > 0;
}

export function makeHandleClosed15s(deps: HandleClosed15sDeps) {
  return async (params: { source: "rollover" | "forceClose"; closed: { data: any } }) => {
    const closed = params.closed;
    const ticks = Number(closed?.data?.ticks ?? 0);

    if (!deps.rolloverOkLoggedRef.value && params.source === "rollover" && ticks > 1) {
      deps.rolloverOkLoggedRef.value = true;
      console.log(
        `[candle15s] ROLLOVER_OK t0=${closed.data.t0} ticks=${ticks} o=${closed.data.o} h=${closed.data.h} l=${closed.data.l} c=${closed.data.c}`
      );
    }

    // Always emit close events for forceClose / tiny bars, but don’t trade
    if (params.source === "forceClose" || ticks <= 1) {
      await deps.emitSafe({
        name: "candle.15s.closed",
        ts: new Date().toISOString(),
        broker: "projectx",
        data: closed.data,
      });
      return;
    }

    // 3a) Persist CLOSED candle + run strategy
    try {
      const db = deps.getPrisma();

      const symbol = (process.env.PROJECTX_SYMBOL || "").trim() || closed.data.contractId;
      const time = Math.floor(closed.data.t0 / 1000);

      // ✅ Backfill missing 15s candles if the broker feed "jumped"
      await backfillMissing15sCandles({
        db,
        symbol,
        currentTime: time,
        emitSafe: deps.emitSafe,
        brokerNameForEvent: "projectx",
      });

      await db.candle15s.upsert({
        where: { symbol_time: { symbol, time } },
        create: {
          symbol,
          time,
          open: closed.data.o,
          high: closed.data.h,
          low: closed.data.l,
          close: closed.data.c,
        },
        update: {
          open: closed.data.o,
          high: closed.data.h,
          low: closed.data.l,
          close: closed.data.c,
        },
      });

      // 3b) Strategy enabled?
      const externalAccountId = String(deps.status?.accountId ?? "");
      const strategyEnabled = externalAccountId
        ? await deps.getStrategyEnabledForAccount({
            brokerName: "projectx",
            externalAccountId,
          })
        : true;

      if (!strategyEnabled || !deps.strategy) {
        return;
      }

      // ✅ Always evaluate candles so HTF context stays fresh (even when paused)
      const evalRes = (deps.strategy as any).evaluateClosed15s({
        symbol,
        time,
        open: closed.data.o,
        high: closed.data.h,
        low: closed.data.l,
        close: closed.data.c,
      });

      // Nothing to record
      if (!evalRes || evalRes.kind === "none") {
        const dbg = deps.strategy.getDebugState?.() as any;
        logTag("NO_TRADE_DEBUG", {
          worker: deps.env.WORKER_NAME,
          source: params.source,
          symbol,
          time,
          ticks,
          engine: dbg ?? null,
        });
        return;
      }

      // You said: ignore direction mismatch completely (never store/evaluate)
      if (evalRes.kind === "blocked" && evalRes.reason === "DIRECTION_MISMATCH") {
        return;
      }

      // We always want a stable signal row key – we can build it from the candidate/intent
      const candidate =
        evalRes.kind === "intent" ? evalRes.intent : evalRes.candidate;

      if (!candidate) {
        const dbg = deps.strategy.getDebugState?.() as any;
        logTag("NO_TRADE_DEBUG", {
          worker: deps.env.WORKER_NAME,
          source: params.source,
          symbol,
          time,
          ticks,
          engine: dbg ?? null,
        });
        return;
      }

      const ident = await deps.getUserIdentityForWorker();

      const signalKey = makeSignalKey({
        strategy: "coreplus315",
        userId: ident.userId,
        symbol,
        side: candidate.side,
        entryTime: candidate.entryTime,
        fvgTime: candidate.fvgTime,
      });

      const bracket = buildBracketFromIntent(candidate);

      // Emit bracket event for UI overlays (even for near-miss blocked signals)
      await deps.emitSafe({
        name: "exec.bracket",
        ts: new Date().toISOString(),
        broker: "projectx",
        data: { source: params.source, bracket, signalKey },
      });

      // -----------------------------
      // ENGINE-LEVEL “NEAR MISS” (blocked) – record & stop
      // -----------------------------
      if (evalRes.kind === "blocked") {
        await db.strategySignal.upsert({
          where: { signalKey },
          create: {
            signalKey,
            userId: ident.userId,
            strategy: "coreplus315",
            brokerName: deps.broker?.name ?? "projectx",
            symbol,
            contractId:
              String(closed?.data?.contractId || (bracket as any).contractId || "").trim() ||
              null,
            side: candidate.side === "sell" ? OrderSide.SELL : OrderSide.BUY,
            entryTime: candidate.entryTime,
            fvgTime: candidate.fvgTime,
            entryPrice: toDec(candidate.entryPrice),
            stopPrice: toDec(candidate.stopPrice),
            takeProfitPrice: toDec(candidate.takeProfitPrice),
            stopTicks: toDec(candidate.stopTicks),
            tpTicks: toDec(candidate.tpTicks),
            rr: toDec(candidate.rr),
            contracts: Number.isFinite(candidate.contracts) ? Number(candidate.contracts) : null,
            riskUsdPlanned: toDec(candidate.riskUsdPlanned),
            status: "BLOCKED",
            blockReason: String(evalRes.reason),
            meta: {
              kind: "ENGINE_BLOCK",
              reason: String(evalRes.reason),
              candidate,
              bracket,
            },
          },
          update: {
            updatedAt: new Date(),
            // keep status BLOCKED and refresh reason/meta
            status: "BLOCKED",
            blockReason: String(evalRes.reason),
            meta: {
              kind: "ENGINE_BLOCK",
              reason: String(evalRes.reason),
              candidate,
              bracket,
            },
          },
        });

        logTag("SIGNAL_ENGINE_BLOCKED", {
          worker: deps.env.WORKER_NAME,
          signalKey,
          reason: String(evalRes.reason),
        });

        return;
      }

      // -----------------------------
      // INTENT (real candidate) – record as DETECTED, then apply runtime blocks/execution
      // -----------------------------
      const intent = evalRes.intent;

      logTag("TRADE_INTENT", { worker: deps.env.WORKER_NAME, intent });
      logTag("BRACKET", { worker: deps.env.WORKER_NAME, bracket });

      // Upsert the signal as DETECTED (idempotent)
      await db.strategySignal.upsert({
        where: { signalKey },
        create: {
          signalKey,
          userId: ident.userId,
          strategy: "coreplus315",
          brokerName: deps.broker?.name ?? "projectx",
          symbol,
          contractId:
            String(closed?.data?.contractId || (bracket as any).contractId || "").trim() ||
            null,
          side: intent.side === "sell" ? OrderSide.SELL : OrderSide.BUY,
          entryTime: intent.entryTime,
          fvgTime: intent.fvgTime,
          entryPrice: toDec(intent.entryPrice),
          stopPrice: toDec(intent.stopPrice),
          takeProfitPrice: toDec(intent.takeProfitPrice),
          stopTicks: toDec(intent.stopTicks),
          tpTicks: toDec(intent.tpTicks),
          rr: toDec(intent.rr),
          contracts: Number.isFinite(intent.contracts) ? Number(intent.contracts) : null,
          riskUsdPlanned: toDec(intent.riskUsdPlanned),
          status: "DETECTED",
          meta: {
            intent,
            bracket,
          },
        },
        update: {
          updatedAt: new Date(),
          meta: {
            intent,
            bracket,
          },
          // don’t overwrite TAKEN/BLOCKED here (runtime blocks below will set BLOCKED explicitly)
        },
      });

      // ✅ Gate execution after ingest (prevents stale context after pause/resume)
      const { isPaused, isKillSwitched } = await deps.getUserTradingState();

      // Block reasons first (and persist them)
      if (isKillSwitched) {
        await db.strategySignal.update({
          where: { signalKey },
          data: { status: "BLOCKED", blockReason: "KILL_SWITCH" },
        });
        console.warn(`[${deps.env.WORKER_NAME}] KILL SWITCH ACTIVE - intent blocked`);
        return;
      }

      if (isPaused) {
        await db.strategySignal.update({
          where: { signalKey },
          data: { status: "BLOCKED", blockReason: "PAUSED" },
        });
        console.log(`[${deps.env.WORKER_NAME}] Trading paused - intent blocked`);
        return;
      }

      if (deps.DRY_RUN) {
        await db.strategySignal.update({
          where: { signalKey },
          data: { status: "BLOCKED", blockReason: "DRY_RUN" },
        });
        console.log("[exec] DRY_RUN=true - intent blocked");
        return;
      }

      if (params.source !== "rollover") {
        await db.strategySignal.update({
          where: { signalKey },
          data: { status: "BLOCKED", blockReason: "NOT_LIVE_CANDLE" },
        });
        console.log("[exec] skipping execution (not a real rollover candle)", {
          source: params.source,
        });
        return;
      }

      // Parse execution inputs from bracket
      const contractIdFromBracket = String(
        closed?.data?.contractId || (bracket as any).contractId || ""
      ).trim();

      const side =
        String((bracket as any).side || "").toLowerCase() === "sell" ? "sell" : "buy";

      const qty = Number((bracket as any).qty ?? 1);

      const stopLossTicks =
        (bracket as any)?.stopLossTicks != null
          ? Number((bracket as any).stopLossTicks)
          : (bracket as any)?.meta?.stopTicks != null
            ? Number((bracket as any).meta.stopTicks)
            : null;

      const takeProfitTicks =
        (bracket as any)?.takeProfitTicks != null
          ? Number((bracket as any).takeProfitTicks)
          : (bracket as any)?.meta?.tpTicks != null
            ? Number((bracket as any).meta.tpTicks)
            : null;

      const bracketValid =
        Boolean(contractIdFromBracket) &&
        Number.isFinite(qty) &&
        qty > 0 &&
        stopLossTicks != null &&
        takeProfitTicks != null;

      if (!bracketValid) {
        await db.strategySignal.update({
          where: { signalKey },
          data: {
            status: "BLOCKED",
            blockReason: "INVALID_BRACKET",
            meta: { intent, bracket, reason: "invalid_bracket_inputs" },
          },
        });
        console.warn("[exec] invalid bracket - intent blocked", {
          contractIdFromBracket,
          qty,
          stopLossTicks,
          takeProfitTicks,
        });
        return;
      }

      // Explicit “in trade” block - so we can show it on charts later
      const inTrade = await hasOpenTrade({
        db,
        userId: ident.userId,
        brokerName: deps.broker.name,
        contractId: contractIdFromBracket,
        symbol: (process.env.PROJECTX_SYMBOL || "").trim() || null,
      });

      if (inTrade) {
        await db.strategySignal.update({
          where: { signalKey },
          data: {
            status: "BLOCKED",
            blockReason: "IN_TRADE",
            meta: { intent, bracket, reason: "in_trade" },
          },
        });
        logTag("SIGNAL_BLOCKED_IN_TRADE", {
          worker: deps.env.WORKER_NAME,
          signalKey,
          contractId: contractIdFromBracket,
          side,
          qty,
        });
        return;
      }

      // Execute
      try {
        const execKey = `coreplus315:${ident.clerkUserId}:${Date.now()}`;

        // ✅ absolute prices from strategy intent (preferred)
        const stopPriceAbs =
          intent?.stopPrice != null && Number.isFinite(Number(intent.stopPrice))
            ? Number(intent.stopPrice)
            : null;

        const takeProfitPriceAbs =
          intent?.takeProfitPrice != null && Number.isFinite(Number(intent.takeProfitPrice))
            ? Number(intent.takeProfitPrice)
            : null;

        const row = await executeBracket({
          prisma: deps.getPrisma(),
          broker: deps.broker,
          input: {
            execKey,
            userId: ident.userId,
            brokerName: deps.broker.name,
            contractId: contractIdFromBracket,
            symbol: (process.env.PROJECTX_SYMBOL || "").trim() || null,
            side,
            qty,
            maxContracts: process.env.AURA_MAX_CONTRACTS
              ? Number(process.env.AURA_MAX_CONTRACTS)
              : null,
            entryType: (deps.strategy?.getConfig?.()?.entryType ?? "market"),
            stopLossTicks: Number(stopLossTicks),
            takeProfitTicks: Number(takeProfitTicks),

            // ✅ NEW: absolute prices from strategy intent
            stopPrice: stopPriceAbs,
            takeProfitPrice: takeProfitPriceAbs,

            customTag: `aura-coreplus315-${Date.now()}`,
          },
        });

        // ✅ Only mark traded after successful submission
        deps.strategy.markActiveFvgTraded({ fvgTime: intent.fvgTime });

        // Mark signal as TAKEN and link it
        await db.strategySignal.update({
          where: { signalKey },
          data: {
            status: "TAKEN",
            execKey,
            executionId: row.id,
            meta: { intent, bracket, executionId: row.id },
          },
        });

        logTag("SIGNAL_TAKEN", {
          worker: deps.env.WORKER_NAME,
          signalKey,
          execKey,
          executionId: row.id,
        });

        console.log("[exec] EXECUTION_SUBMITTED", {
          execKey,
          executionId: row.id,
          contractId: contractIdFromBracket,
          side,
          qty,
          stopLossTicks,
          takeProfitTicks,
        });
      } catch (e) {
        await db.strategySignal.update({
          where: { signalKey },
          data: {
            status: "BLOCKED",
            blockReason: "EXECUTION_FAILED",
            meta: {
              intent,
              bracket,
              error: e instanceof Error ? e.message : String(e),
            },
          },
        });

        console.error("[exec] executeBracket failed", e);

        try {
          await db.eventLog.create({
            data: {
              type: "exec.failed",
              level: "error",
              message: "executeBracket failed",
              data: {
                clerkUserId: ident.clerkUserId,
                error: e instanceof Error ? e.message : String(e),
                bracket,
              },
              userId: ident.userId,
            },
          });
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.error("[projectx-market] failed to persist Candle15s / run strategy", e);
    }

    // 3c) Emit candle close event
    await deps.emitSafe({
      name: "candle.15s.closed",
      ts: new Date().toISOString(),
      broker: "projectx",
      data: closed.data,
    });
  };
}
