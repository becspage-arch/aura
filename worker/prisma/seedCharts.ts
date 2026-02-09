import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function getDbUrl() {
  // Prefer DIRECT_URL for scripts (more reliable than pooled)
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DIRECT_URL/DATABASE_URL in env.");
  return url;
}

function requireExplicitProdOk() {
  // We allow production seeding ONLY if you explicitly opt in.
  // This prevents accidental seeding of prod.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED_CHARTS !== "true") {
    throw new Error(
      'Refusing to seed in production. Set ALLOW_PROD_SEED_CHARTS="true" to proceed.'
    );
  }
}

function floorToSec(sec: number, stepSec: number) {
  return Math.floor(sec / stepSec) * stepSec;
}

async function main() {
  requireExplicitProdOk();

  const adapter = new PrismaPg({ connectionString: getDbUrl() });
  const prisma = new PrismaClient({ adapter });

  const symbol = process.env.SEED_SYMBOL ?? "MGC";
  const days = Number(process.env.SEED_15S_DAYS ?? 30);

  // 30 days of 15s candles = 30 * 24 * 60 * 4 = 172,800 candles
  const stepSec = 15;
  const total = days * 24 * 60 * 4;

  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = floorToSec(nowSec, stepSec);
  const startSec = endSec - (total - 1) * stepSec;

  // Generate deterministic-ish candles (no randomness so reruns are stable)
  let price = 2050.0;
  const batchSize = 5000;

  let inserted = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const count = Math.min(batchSize, total - offset);
    const batch: Array<{
      symbol: string;
      time: number;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const idx = offset + i;
      const t = startSec + idx * stepSec;

      // smooth wave + slight drift
      const drift = Math.sin(idx / 180) * 0.25 + Math.sin(idx / 33) * 0.08;
      const open = price;
      const close = open + drift;

      const wickUp = 0.12 + (Math.abs(Math.sin(idx / 29)) * 0.18);
      const wickDn = 0.12 + (Math.abs(Math.cos(idx / 31)) * 0.18);

      const high = Math.max(open, close) + wickUp;
      const low = Math.min(open, close) - wickDn;

      const volume = 80 + (idx % 40);

      batch.push({
        symbol,
        time: t,
        open: open.toFixed(2),
        high: high.toFixed(2),
        low: low.toFixed(2),
        close: close.toFixed(2),
        volume: String(volume),
      });

      price = close;
    }

    // Insert into Candle15s; skip duplicates so reruns are safe
    await prisma.candle15s.createMany({
      data: batch as any,
      skipDuplicates: true,
    });

    inserted += batch.length;
    console.log(`🕯️ Seeded ${inserted}/${total} Candle15s rows...`);
  }

  // ---- Seed one marker via Order + Fill (safe, isolated) ----
  // Create (or reuse) a dedicated seed user + broker account
  const seedUser = await prisma.userProfile.upsert({
    where: { clerkUserId: "seed-charts" },
    create: { clerkUserId: "seed-charts", email: "seed-charts@tradeaura.net", displayName: "Seed Charts" },
    update: {},
  });

  const seedAccount = await prisma.brokerAccount.upsert({
    where: { brokerName_externalId: { brokerName: "SEED", externalId: "SEED-001" } },
    create: {
      userId: seedUser.id,
      brokerName: "SEED",
      externalId: "SEED-001",
      accountLabel: "Seed Account",
    },
    update: { userId: seedUser.id, accountLabel: "Seed Account" },
  });

  // Remove prior SEED markers so you always see exactly one fresh marker
  await prisma.fill.deleteMany({
    where: { brokerAccountId: seedAccount.id, symbol, externalId: { startsWith: "SEED-" } } as any,
  });
  await prisma.order.deleteMany({
    where: { brokerAccountId: seedAccount.id, symbol, externalId: { startsWith: "SEED-" } } as any,
  });

  // Put the marker near the right edge (latest candles)
  const orderCreatedSec = endSec - 60; // ~1 minute before last candle
  const fillCreatedSec = orderCreatedSec + 15;

  const order = await prisma.order.create({
    data: {
      brokerAccountId: seedAccount.id,
      externalId: `SEED-ORDER-${orderCreatedSec}`,
      symbol,
      side: "BUY",
      type: "MARKET",
      status: "FILLED",
      qty: "1" as any,
      filledQty: "1" as any,
      avgFillPrice: "2050.50" as any,
      createdAt: new Date(orderCreatedSec * 1000),
      updatedAt: new Date(fillCreatedSec * 1000),
    },
  });

  const fill = await prisma.fill.create({
    data: {
      brokerAccountId: seedAccount.id,
      orderId: order.id,
      externalId: `SEED-FILL-${fillCreatedSec}`,
      symbol,
      side: "BUY",
      qty: "1" as any,
      price: "2050.50" as any,
      createdAt: new Date(fillCreatedSec * 1000),
    },
  });

  console.log("✅ Seed charts complete");
  console.log({
    symbol,
    days15s: days,
    totalCandlesAttempted: total,
    marker: { orderId: order.id, fillId: fill.id, at: fillCreatedSec },
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Seed charts failed:", e);
  process.exit(1);
});
