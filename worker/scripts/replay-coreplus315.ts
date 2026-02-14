// worker/scripts/replay-coreplus315.ts
import "dotenv/config";
// ❌ remove this
// import { PrismaClient } from "@prisma/client";

// ✅ use the same prisma instance your app uses (it has the Neon adapter wired)
import { prisma } from "../../src/lib/prisma";
import { CorePlus315Engine } from "../src/strategy/coreplus315Engine.js";

// ❌ remove this
// const prisma = new PrismaClient();

function numEnv(name: string, fallback: number) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  // Adjust if you want. This is just for replay diagnostics.
  const TAKE = numEnv("REPLAY_TAKE", 2000);

  // Use your configured symbol if present; otherwise use what’s in DB.
  const SYMBOL = (process.env.PROJECTX_SYMBOL || "").trim() || null;

  // Tick size/value only affect sizing math. Defaults here are sane for testing.
  // Override if you want exact values:
  //   set REPLAY_TICK_SIZE, REPLAY_TICK_VALUE
  const tickSize = numEnv("REPLAY_TICK_SIZE", 0.1);
  const tickValue = numEnv("REPLAY_TICK_VALUE", 1);

  // If your user risk is stored elsewhere, this is fine for replay.
  const engine = new CorePlus315Engine({
    tickSize,
    tickValue,
    userSettings: { riskUsd: numEnv("REPLAY_RISK_USD", 50) },
  });

  const rows = await prisma.candle15s.findMany({
    where: SYMBOL ? { symbol: SYMBOL } : undefined,
    orderBy: { time: "desc" },
    take: TAKE,
  });

  if (!rows.length) {
    console.log("No candle15s rows found for replay.", { SYMBOL, TAKE });
    return;
  }

  const candles = rows.slice().reverse();

  console.log("Replay starting", {
    symbol: candles[0]?.symbol,
    from: new Date(candles[0].time * 1000).toISOString(),
    to: new Date(candles[candles.length - 1].time * 1000).toISOString(),
    count: candles.length,
    tickSize,
    tickValue,
  });

  const counts: Record<string, number> = {};
  let lastHasActive = false;

  for (const c of candles) {
    const res = engine.evaluateClosed15s({
      symbol: c.symbol,
      time: c.time,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: null,
    });

    const dbg = engine.getDebugState();

    // Track when we first get HTF context and an active FVG
    if (!lastHasActive && dbg.hasActiveFvg) {
      console.log("✅ hasActiveFvg became TRUE", {
        at: new Date(c.time * 1000).toISOString(),
        fvg: dbg.fvg,
        last3mCount: dbg.last3mCount,
      });
      lastHasActive = true;
    }

    if (res.kind === "blocked") {
      counts[res.reason] = (counts[res.reason] ?? 0) + 1;
      // Only log the most important blocked reasons (keeps output readable)
      if (
        res.reason === "NO_ACTIVE_FVG" ||
        res.reason === "NOT_RETESTED" ||
        res.reason === "STOP_TOO_BIG" ||
        res.reason === "FVG_INVALID"
      ) {
        console.log("BLOCKED", res.reason, {
          t: new Date(c.time * 1000).toISOString(),
          engine: dbg,
          candidate: {
            side: res.candidate.side,
            entryTime: res.candidate.entryTime,
            fvgTime: res.candidate.fvgTime,
            entryPrice: res.candidate.entryPrice,
            stopPrice: res.candidate.stopPrice,
          },
        });
      }
    }

    if (res.kind === "intent") {
      counts["INTENT"] = (counts["INTENT"] ?? 0) + 1;
      console.log("🔥 INTENT", {
        t: new Date(c.time * 1000).toISOString(),
        intent: {
          side: res.intent.side,
          entryTime: res.intent.entryTime,
          fvgTime: res.intent.fvgTime,
          entryPrice: res.intent.entryPrice,
          stopPrice: res.intent.stopPrice,
          stopTicks: res.intent.stopTicks,
          tpTicks: res.intent.tpTicks,
          contracts: res.intent.contracts,
          riskUsdPlanned: res.intent.riskUsdPlanned,
          meta: res.intent.meta,
        },
        engine: dbg,
      });
    }
  }

  console.log("Replay summary counts:", counts);

  // Extra sanity:
  console.log("Final engine state:", engine.getDebugState());
}

main()
  .catch((e) => {
    console.error("Replay failed:", e);
    process.exitCode = 1;
  })
// ❌ remove this block
// .finally(async () => {
//   await prisma.$disconnect();
// });
