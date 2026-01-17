import { env } from "../env.js";
import { PrismaClient } from "@prisma/client";
import { createBroker } from "./createBroker.js";
import { ProjectXMarketHub } from "./projectxMarketHub.js";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Candle15sAggregator } from "../candles/candle15sAggregator.js";
import { CorePlus315Engine, type Candle15s as StratCandle15s } from "../strategy/coreplus315Engine.js";
import { buildBracketFromIntent } from "../trading/buildBracket.js";

// --- quote persist throttle (per instrument) ---
const lastPersistAtByInstrument = new Map<string, number>();
const PERSIST_EVERY_MS = 250;

const candle15s = new Candle15sAggregator();

export type BrokerEventName =
  | "broker.connected"
  | "broker.authorized"
  | "broker.ready"
  | "broker.error"
  | "broker.market.quote"
  | "candle.15s.closed"
  | "exec.bracket";

export type BrokerEvent = {
  name: BrokerEventName;
  ts: string;
  broker: string;
  data?: Record<string, unknown>;
};

type EmitFn = (event: BrokerEvent) => Promise<void> | void;

let prisma: PrismaClient | null = null;
let prismaPool: Pool | null = null;

function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim() || "";

  if (!url) {
    throw new Error(
      "DATABASE_URL is missing/empty. Set it in worker/.env (or your shell env)."
    );
  }

  return url;
}

function getPrisma(): PrismaClient {
  if (prisma) return prisma;

  const url = getDatabaseUrl();

  prismaPool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(prismaPool);

  prisma = new PrismaClient({
    adapter,
    log: ["error"],
  });

  return prisma;
}

async function shutdownPrisma(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
    }
  } catch (e) {
    console.warn(`[${env.WORKER_NAME}] prisma disconnect failed`, e);
  } finally {
    prisma = null;
  }

  try {
    if (prismaPool) {
      await prismaPool.end();
    }
  } catch (e) {
    console.warn(`[${env.WORKER_NAME}] pg pool end failed`, e);
  } finally {
    prismaPool = null;
  }
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Replay last N closed 15s candles from DB into the strategy engine.
 * This is ONLY to prove wiring works on weekends / when live quotes are empty.
 */
async function replayRecentCandlesOnce(params: {
  symbol: string;
  limit: number;
  engine: CorePlus315Engine;
}): Promise<void> {
  const db = getPrisma();

  const rows = await db.candle15s.findMany({
    where: { symbol: params.symbol },
    orderBy: { time: "desc" },
    take: params.limit,
  });

  const candlesAsc = rows
    .slice()
    .reverse()
    .map(
      (r): StratCandle15s => ({
        symbol: r.symbol,
        time: Number(r.time),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: r.volume == null ? null : Number(r.volume),
      })
    );

  console.log(`[${env.WORKER_NAME}] strategy replay start`, {
    symbol: params.symbol,
    limit: params.limit,
    loaded: candlesAsc.length,
    first: candlesAsc[0]?.time ?? null,
    last: candlesAsc[candlesAsc.length - 1]?.time ?? null,
  });

  let intents = 0;

  for (const c of candlesAsc) {
    const intent = params.engine.ingestClosed15s(c);
    if (intent) {
      intents++;
      console.log(`[${env.WORKER_NAME}] TRADE_INTENT (replay)`, intent);

      const bracket = buildBracketFromIntent(intent);
      console.log(`[${env.WORKER_NAME}] BRACKET (replay)`, bracket);
    }
  }

  console.log(`[${env.WORKER_NAME}] strategy replay done`, {
    intents,
  });
}

export async function startBrokerFeed(emit?: EmitFn): Promise<void> {
  const broker = createBroker();

  const emitSafe = async (event: BrokerEvent) => {
    try {
      await emit?.(event);
    } catch (e) {
      console.error(`[${env.WORKER_NAME}] broker event emit failed`, {
        event,
        err: e,
      });
    }
  };

  console.log(`[${env.WORKER_NAME}] broker starting`, {
    broker: broker.name,
  });

  // Ensure we cleanly close Prisma on shutdown
  const onSig = async (sig: string) => {
    console.log(`[${env.WORKER_NAME}] received ${sig}, shutting down...`);
    await shutdownPrisma();
    process.exit(0);
  };
  process.once("SIGINT", () => void onSig("SIGINT"));
  process.once("SIGTERM", () => void onSig("SIGTERM"));

  try {
    await broker.connect();
    await emitSafe({
      name: "broker.connected",
      ts: new Date().toISOString(),
      broker: broker.name,
    });

    await broker.authorize();
    await emitSafe({
      name: "broker.authorized",
      ts: new Date().toISOString(),
      broker: broker.name,
    });

    if (typeof (broker as any).warmup === "function") {
      await (broker as any).warmup();
    }

    broker.startKeepAlive();

    console.log(`[${env.WORKER_NAME}] broker ready for market data`, {
      broker: broker.name,
    });

    const status =
      typeof (broker as any).getStatus === "function"
        ? (broker as any).getStatus()
        : null;

    await emitSafe({
      name: "broker.ready",
      ts: new Date().toISOString(),
      broker: broker.name,
      data: status ?? undefined,
    });

    // --- Strategy engine bootstrap (config single-source-of-truth) ---
    const tickSize = numOrNull(status?.tickSize);
    const tickValue = numOrNull(status?.tickValue);

    let strategy: CorePlus315Engine | null = null;

    if (tickSize && tickValue) {
      strategy = new CorePlus315Engine({ tickSize, tickValue });
      // v1 hard-coded overrides live here (later becomes per-user settings from DB)
      strategy.setConfig({
        riskUsd: 200,
        rr: 2,
        maxStopTicks: 45,
        entryType: "market",
      });

      console.log(`[${env.WORKER_NAME}] strategy ready`, {
        name: "coreplus315",
        tickSize,
        tickValue,
        cfg: strategy.getConfig(),
      });

      // Weekend-proof: replay seeded candles once so we can see intents immediately
      const symbol = (process.env.PROJECTX_SYMBOL || "").trim();
      if (symbol) {
        await replayRecentCandlesOnce({
          symbol,
          limit: 600,
          engine: strategy,
        });
      } else {
        console.warn(
          `[${env.WORKER_NAME}] strategy replay skipped (PROJECTX_SYMBOL missing)`
        );
      }
    } else {
      console.warn(`[${env.WORKER_NAME}] strategy NOT started (missing tickSize/tickValue)`, {
        tickSize,
        tickValue,
      });
    }

    // --- ProjectX market hub ---
    if (broker.name === "projectx") {
      const token =
        typeof (broker as any).getAuthToken === "function"
          ? (broker as any).getAuthToken()
          : null;

      const contractId = process.env.PROJECTX_CONTRACT_ID?.trim() || null;

      if (!token) {
        console.warn("[projectx-market] no token available, market hub not started");
        return;
      }

      if (!contractId) {
        console.warn(
          "[projectx-market] PROJECTX_CONTRACT_ID not set, market hub not started"
        );
        return;
      }

      try {
        const marketHub = new ProjectXMarketHub({
          token,
          contractId,
          raw: true,
          debugInvocations: true,
          onQuote: async (q) => {
            // 1) Persist quote snapshot (THROTTLED)
            try {
              const instrumentKey = q.contractId;
              const now = Date.now();
              const last = lastPersistAtByInstrument.get(instrumentKey) ?? 0;

              if (now - last >= PERSIST_EVERY_MS) {
                lastPersistAtByInstrument.set(instrumentKey, now);

                const db = getPrisma();

                await db.eventLog.create({
                  data: {
                    type: "market.quote",
                    level: "info",
                    message: "ProjectX quote",
                    data: {
                      broker: "projectx",
                      contractId: q.contractId,
                      bid: q.bid ?? null,
                      ask: q.ask ?? null,
                      last: q.last ?? null,
                      ts: q.ts ?? null,
                    },
                  },
                });
              }
            } catch (e) {
              console.error("[projectx-market] failed to persist quote", e);
            }

            // 2) Emit quote event
            await emitSafe({
              name: "broker.market.quote",
              ts: new Date().toISOString(),
              broker: "projectx",
              data: {
                contractId: q.contractId,
                bid: q.bid,
                ask: q.ask,
                last: q.last ?? null,
                ts: q.ts ?? null,
              },
            });

            // If we have no price, we can't build candles.
            if (q.last == null && q.bid == null && q.ask == null) return;

            // 3) Build 15s candle from quote stream
            const closed = candle15s.ingest(
              {
                contractId: q.contractId,
                bid: q.bid,
                ask: q.ask,
                last: q.last ?? null,
                ts: q.ts ?? null,
              },
              Date.now()
            );

            if (!closed) return;

            // 3a) Persist CLOSED candle
            try {
              const db = getPrisma();
              const symbol = (process.env.PROJECTX_SYMBOL || "").trim() || closed.data.contractId;
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

              // 3b) Run strategy on closed candle (live mode)
              if (strategy) {
                const intent = strategy.ingestClosed15s({
                  symbol,
                  time,
                  open: closed.data.o,
                  high: closed.data.h,
                  low: closed.data.l,
                  close: closed.data.c,
                });

                if (intent) {
                  console.log(`[${env.WORKER_NAME}] TRADE_INTENT (live)`, intent);

                  const bracket = buildBracketFromIntent(intent);
                  console.log(`[${env.WORKER_NAME}] BRACKET (live)`, bracket);

                  await emitSafe({
                    name: "exec.bracket",
                    ts: new Date().toISOString(),
                    broker: "projectx",
                    data: {
                      source: "live",
                      bracket,
                    },
                  });
                }
              }
            } catch (e) {
              console.error("[projectx-market] failed to persist Candle15s / run strategy", e);
            }

            // 3c) Emit candle close event
            await emitSafe({
              name: "candle.15s.closed",
              ts: new Date().toISOString(),
              broker: "projectx",
              data: closed.data,
            });
          },
        });

        await marketHub.start();

        console.log("[projectx-market] started", {
          accountId: status?.accountId ?? null,
          contractId,
        });
      } catch (e) {
        console.error("[projectx-market] failed to start", e);
      }
    }
  } catch (e) {
    await emitSafe({
      name: "broker.error",
      ts: new Date().toISOString(),
      broker: broker.name,
      data: { message: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
