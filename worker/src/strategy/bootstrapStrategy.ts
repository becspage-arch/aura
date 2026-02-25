// worker/src/strategy/bootstrapStrategy.ts
import type { PrismaClient } from "@prisma/client";
import {
  CorePlus315Engine,
  type Candle15s as StratCandle15s,
} from "./coreplus315Engine.js";
import { buildBracketFromIntent } from "../trading/buildBracket.js";
import Ably from "ably";

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Replay last N closed 15s candles from DB into the strategy engine.
 * ONLY for weekends / debugging.
 */
async function replayRecentCandlesOnce(params: {
  env: { WORKER_NAME: string };
  getPrisma: () => PrismaClient;
  symbol: string;
  limit: number;
  engine: CorePlus315Engine;
}): Promise<void> {
  const db = params.getPrisma();

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

  console.log(`[${params.env.WORKER_NAME}] strategy replay start`, {
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
      console.log(`[${params.env.WORKER_NAME}] TRADE_INTENT (replay)`, intent);

      const bracket = buildBracketFromIntent(intent);
      console.log(`[${params.env.WORKER_NAME}] BRACKET (replay)`, bracket);
    }
  }

  console.log(`[${params.env.WORKER_NAME}] strategy replay done`, { intents });
}

export async function bootstrapStrategy(params: {
  env: { WORKER_NAME: string };
  getPrisma: () => PrismaClient;

  clerkUserId: string;

  status: any;

  getStrategySettingsForWorker: () => Promise<{
    riskUsd: number;
    rr: number;
    maxStopTicks: number;
    entryType: "market" | "limit";
    sessions?: { asia: boolean; london: boolean; ny: boolean };
  }>;
}) {
  const tickSize = numOrNull(params.status?.tickSize);
  const tickValue = numOrNull(params.status?.tickValue);

  if (!tickSize || !tickValue) {
    console.warn(
      `[${params.env.WORKER_NAME}] strategy NOT started (missing tickSize/tickValue)`,
      { tickSize, tickValue }
    );
    return { strategy: null as CorePlus315Engine | null };
  }

  const strategy = new CorePlus315Engine({ tickSize, tickValue });

  const ss = await params.getStrategySettingsForWorker();

  strategy.setConfig({
    riskUsd: ss.riskUsd,
    rr: ss.rr,
    maxStopTicks: ss.maxStopTicks,
    entryType: ss.entryType,
  });

  console.log(`[${params.env.WORKER_NAME}] strategySettings loaded (risk)`, {
    riskUsd: ss.riskUsd,
    rr: ss.rr,
    maxStopTicks: ss.maxStopTicks,
    entryType: ss.entryType,
  });

  console.log(`[${params.env.WORKER_NAME}] strategy ready`, {
    name: "coreplus315",
    tickSize,
    tickValue,
    cfg: strategy.getConfig(),
  });

  // Hot-apply via Ably: user:<clerkUserId> event: strategy_settings_update
  const ablyKey = (process.env.ABLY_API_KEY || "").trim();

  if (!ablyKey) {
    console.warn(
      `[${params.env.WORKER_NAME}] Ably disabled (ABLY_API_KEY missing) - strategy settings hot-apply will not run`
    );
  } else if (!params.clerkUserId?.trim()) {
    console.warn(
      `[${params.env.WORKER_NAME}] Ably subscribe skipped (clerkUserId missing)`
    );
  } else {
    const channelName = `user:${params.clerkUserId.trim()}`;

    const realtime = new Ably.Realtime({ key: ablyKey });

    realtime.connection.on("connected", () => {
      console.log(`[${params.env.WORKER_NAME}] Ably connected`, { channelName });
    });

    realtime.connection.on("failed", (st) => {
      console.warn(`[${params.env.WORKER_NAME}] Ably connection failed`, {
        reason: st?.reason?.message ?? null,
      });
    });

    const ch = realtime.channels.get(channelName);

    ch.subscribe("strategy_settings_update", (msg) => {
      try {
        const payload: any = msg?.data ?? null;
        const ss = payload?.strategySettings ?? payload ?? null;

        if (!ss) {
          console.warn(`[${params.env.WORKER_NAME}] strategy_settings_update ignored (no payload)`);
          return;
        }

        const next = {
          riskUsd: Number(ss?.riskUsd ?? strategy.getConfig().riskUsd),
          rr: Number(ss?.rr ?? strategy.getConfig().rr),
          maxStopTicks: Number(ss?.maxStopTicks ?? strategy.getConfig().maxStopTicks),
          entryType: (ss?.entryType === "limit" ? "limit" : "market") as "market" | "limit",
        };

        strategy.setConfig(next);

        console.log(`[${params.env.WORKER_NAME}] strategySettings applied (Ably)`, {
          ...next,
          sessions: ss?.sessions ?? null,
        });
      } catch (e) {
        console.warn(`[${params.env.WORKER_NAME}] strategy_settings_update handler failed`, e);
      }
    });

    process.once("SIGINT", () => {
      try {
        realtime.close();
      } catch {}
    });
    process.once("SIGTERM", () => {
      try {
        realtime.close();
      } catch {}
    });

    console.log(`[${params.env.WORKER_NAME}] Ably strategy settings subscription active`, {
      channelName,
      event: "strategy_settings_update",
    });
  }

  // Replay is ONLY for weekends / debugging.
  const enableReplay = process.env.STRATEGY_REPLAY === "1";

  if (enableReplay) {
    const symbol = (process.env.PROJECTX_SYMBOL || "").trim();
    if (symbol) {
      await replayRecentCandlesOnce({
        env: params.env,
        getPrisma: params.getPrisma,
        symbol,
        limit: 600,
        engine: strategy,
      });
    } else {
      console.warn(
        `[${params.env.WORKER_NAME}] strategy replay skipped (PROJECTX_SYMBOL missing)`
      );
    }
  } else {
    console.log(
      `[${params.env.WORKER_NAME}] strategy replay disabled (STRATEGY_REPLAY!=1)`
    );
  }

  return { strategy };
}
