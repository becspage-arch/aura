// worker/scripts/replay-coreplus315.ts
import path from "node:path";
import dotenv from "dotenv";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { CorePlus315Engine } from "../src/strategy/coreplus315Engine.js";

// 1) Load env the same way Next does (so DATABASE_URL exists)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function getDbUrl() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("Missing DATABASE_URL/DIRECT_URL in env.");
  return url;
}

// 2) Create Prisma client locally (do NOT import from src/)
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDbUrl() }),
  log: ["error"],
});

async function main() {
  // TODO: adjust these as needed for your replay window
  const symbol = (process.env.PROJECTX_SYMBOL || "CON.F.US.MGC.J26").trim();

  const rows = await prisma.candle15s.findMany({
    where: { symbol },
    orderBy: { time: "asc" },
    take: 2000,
  });

  console.log(`[replay] loaded ${rows.length} candles for ${symbol}`);

  // tickSize/tickValue for MGC (adjust if you’ve set these elsewhere)
  const engine = new CorePlus315Engine({
    tickSize: 0.1,
    tickValue: 1.0,
    userSettings: { riskUsd: 10 },
  });

  let intents = 0;
  let blocked = 0;

  for (const r of rows) {
    const res = engine.evaluateClosed15s({
      symbol: r.symbol,
      time: r.time,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    });

    if (res.kind === "intent") intents++;
    if (res.kind === "blocked") blocked++;

    // Uncomment if you want to print intents:
    // if (res.kind === "intent") console.log("[intent]", res.intent);
  }

  console.log("[replay] done", {
    intents,
    blocked,
    debug: engine.getDebugState?.() ?? null,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
