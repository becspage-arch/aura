// src/broker/projectx/handleClosed15s.ts
import type { PrismaClient } from "@prisma/client";

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

export function makeHandleClosed15s(deps: HandleClosed15sDeps) {
  return async (params: {
    source: "rollover" | "forceClose";
    closed: { data: any };
  }) => {
    const closed = params.closed;

    const ticks = Number(closed?.data?.ticks ?? 0);

    if (!deps.rolloverOkLoggedRef.value && params.source === "rollover" && ticks > 1) {
      deps.rolloverOkLoggedRef.value = true;
      console.log(
        `[candle15s] ROLLOVER_OK t0=${closed.data.t0} ticks=${ticks} o=${closed.data.o} h=${closed.data.h} l=${closed.data.l} c=${closed.data.c}`
      );
    }

    if (params.source === "forceClose" || ticks <= 1) {
      await deps.emitSafe({
        name: "candle.15s.closed",
        ts: new Date().toISOString(),
        broker: "projectx",
        data: closed.data,
      });
      return;
    }

    // 3a) Persist CLOSED candle
    try {
      const db = deps.getPrisma();

      const symbol =
        (process.env.PROJECTX_SYMBOL || "").trim() || closed.data.contractId;

      const time = Math.floor(closed.data.t0 / 1000);

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

      // 3b) Run strategy on closed candle (ONLY if enabled, and obey pause/kill switch)
      const externalAccountId = String(deps.status?.accountId ?? "");
      const strategyEnabled = externalAccountId
        ? await deps.getStrategyEnabledForAccount({
            brokerName: "projectx",
            externalAccountId,
          })
        : true;

      if (strategyEnabled && deps.strategy) {
        const { isPaused, isKillSwitched } = await deps.getUserTradingState();

        console.log(`[${deps.env.WORKER_NAME}] state on rollover`, {
          isPaused,
          isKillSwitched,
          source: params.source,
          time,
          symbol,
        });

        if (isKillSwitched) {
          console.warn(`[${deps.env.WORKER_NAME}] KILL SWITCH ACTIVE - trading blocked`);
          return;
        }

        if (isPaused) {
          console.log(`[${deps.env.WORKER_NAME}] Trading paused - skipping strategy`);
          return;
        }

        console.log(`[${deps.env.WORKER_NAME}] Strategy tick (live)`, {
          source: params.source,
          symbol,
          time,
          o: closed.data.o,
          h: closed.data.h,
          l: closed.data.l,
          c: closed.data.c,
          ticks,
        });

        const intent = deps.strategy.ingestClosed15s({
          symbol,
          time,
          open: closed.data.o,
          high: closed.data.h,
          low: closed.data.l,
          close: closed.data.c,
        });

        if (!intent) {
          const dbg = deps.strategy.getDebugState?.() as any;

          logTag(`[${deps.env.WORKER_NAME}] NO_TRADE_DEBUG`, {
            source: params.source,
            symbol,
            time,
            ticks,
            engine: dbg ?? null,
          });
        }

        if (intent) {
          logTag(`[${deps.env.WORKER_NAME}] TRADE_INTENT`, intent);

          const bracket = buildBracketFromIntent(intent);
          logTag(`[${deps.env.WORKER_NAME}] BRACKET`, bracket);

          await deps.emitSafe({
            name: "exec.bracket",
            ts: new Date().toISOString(),
            broker: "projectx",
            data: { source: params.source, bracket },
          });

          if (deps.DRY_RUN) {
            console.log("[exec] DRY_RUN=true — skipping live execution");
            return;
          }

          if (params.source !== "rollover") {
            console.log("[exec] skipping execution (not a real rollover candle)", {
              source: params.source,
            });
            return;
          }

          try {
            const ident = await deps.getUserIdentityForWorker();

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

            if (!contractIdFromBracket) {
              console.warn("[exec] missing contractId on bracket - cannot execute", bracket);
              return;
            }

            if (!Number.isFinite(qty) || qty <= 0) {
              console.warn("[exec] invalid qty on bracket - cannot execute", { qty, bracket });
              return;
            }

            if (stopLossTicks == null || takeProfitTicks == null) {
              console.warn("[exec] missing SL/TP ticks on bracket - cannot execute", {
                stopLossTicks,
                takeProfitTicks,
                bracket,
              });
              return;
            }

            const execKey = `coreplus315:${ident.clerkUserId}:${Date.now()}`;

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
                maxContracts: process.env.AURA_MAX_CONTRACTS ? Number(process.env.AURA_MAX_CONTRACTS) : null,
                entryType: "market",
                stopLossTicks: Number(stopLossTicks),
                takeProfitTicks: Number(takeProfitTicks),
                customTag: `aura-coreplus315-${Date.now()}`,
              },
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
            console.error("[exec] executeBracket failed", e);

            try {
              const ident = await deps.getUserIdentityForWorker();
              const db = deps.getPrisma();

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
