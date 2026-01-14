import "dotenv/config";
import { PrismaClient, CandleTimeframe } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function getDbUrl() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DIRECT_URL/DATABASE_URL in env.");
  return url;
}

function mustAllowProd() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error('Refusing to seed production. Set ALLOW_PROD_SEED="true".');
  }
}

function floorToMs(ms: number, stepMs: number) {
  return Math.floor(ms / stepMs) * stepMs;
}

async function main() {
  mustAllowProd();

  const adapter = new PrismaPg({ connectionString: getDbUrl() });
  const prisma = new PrismaClient({ adapter });

  const symbol = (process.env.SEED_SYMBOL ?? "MGC").toUpperCase();
  const days = Number(process.env.SEED_15S_DAYS ?? 30);

  const stepMs = 15_000;
  const nowMs = Date.now();
  const endMs = floorToMs(nowMs, stepMs);

  const total = days * 24 * 60 * 4; // 15s candles per day
  const startMs = endMs - (total - 1) * stepMs;

  let price = 2050.0;

  let upserted = 0;

  for (let idx = 0; idx < total; idx++) {
    const ts = new Date(startMs + idx * stepMs);

    // deterministic drift (stable + repeatable)
    const drift = Math.sin(idx / 180) * 0.25 + Math.sin(idx / 33) * 0.08;
    const open = price;
    const close = open + drift;

    const wickUp = 0.12 + Math.abs(Math.sin(idx / 29)) * 0.18;
    const wickDn = 0.12 + Math.abs(Math.cos(idx / 31)) * 0.18;

    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDn;

    const volume = 80 + (idx % 40);

    price = close;

    await prisma.candle.upsert({
      where: {
        symbol_timeframe_ts: { symbol, timeframe: CandleTimeframe.S15, ts },
      },
      create: {
        symbol,
        timeframe: CandleTimeframe.S15,
        ts,
        open: open.toFixed(2) as any,
        high: high.toFixed(2) as any,
        low: low.toFixed(2) as any,
        close: close.toFixed(2) as any,
        volume: String(volume) as any,
      },
      update: {
        open: open.toFixed(2) as any,
        high: high.toFixed(2) as any,
        low: low.toFixed(2) as any,
        close: close.toFixed(2) as any,
        volume: String(volume) as any,
      },
    });

    upserted += 1;

    // progress log every 2000 candles
    if (upserted % 2000 === 0) {
      console.log(`🕯️ Upserted ${upserted}/${total} S15 candles...`);
    }
  }

  console.log("✅ Done seeding Candle (S15)", { symbol, days, total });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
