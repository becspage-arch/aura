import "dotenv/config";
import { PrismaClient, OrderSide, OrderType, OrderStatus, CandleTimeframe } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function getDbUrl() {
  // Prefer DIRECT_URL for scripts (more reliable than pooled)
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DIRECT_URL/DATABASE_URL in env.");
  return url;
}

function assertNotProduction() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in NODE_ENV=production.");
  }
}

function floorToMs(ms: number, stepMs: number) {
  return Math.floor(ms / stepMs) * stepMs;
}

function genCandles(params: {
  symbol: string;
  timeframe: CandleTimeframe;
  endMs: number;
  stepMs: number;
  count: number;
  startPrice: number;
  volatility: number; // rough price movement size
  volumeBase: number;
}) {
  const { symbol, timeframe, endMs, stepMs, count, startPrice, volatility, volumeBase } = params;

  // Build ascending candles from oldest -> newest
  const startMs = endMs - (count - 1) * stepMs;

  let lastClose = startPrice;

  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const ts = new Date(startMs + i * stepMs);

    // simple random walk
    const drift = (Math.random() - 0.5) * volatility;
    const open = lastClose;
    const close = open + drift;

    const wickUp = Math.random() * (volatility * 0.8);
    const wickDn = Math.random() * (volatility * 0.8);

    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDn;

    lastClose = close;

    out[i] = {
      symbol,
      timeframe,
      ts,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: String(volumeBase + (i % 50)),
    };
  }

  return out;
}

async function createManyBatched<T extends Record<string, any>>(
  prisma: PrismaClient,
  data: T[],
  batchSize = 5000
) {
  let inserted = 0;
  const total = data.length;
  const batches = Math.ceil(total / batchSize);

  for (let i = 0; i < batches; i++) {
    const chunk = data.slice(i * batchSize, (i + 1) * batchSize);
    // @ts-expect-error prisma typing for createMany
    await prisma.candle.createMany({ data: chunk });
    inserted += chunk.length;
    console.log(`🕯️ Inserted candle batch ${i + 1}/${batches} (${chunk.length})`);
  }

  return inserted;
}

async function main() {
  assertNotProduction();

  const adapter = new PrismaPg({ connectionString: getDbUrl() });
  const prisma = new PrismaClient({ adapter });

  // Wipe dev tables (safe because NOT production)
  try {
    await prisma.fill.deleteMany();
    await prisma.order.deleteMany();
    await prisma.brokerAccount.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.eventLog.deleteMany();
    await prisma.candle.deleteMany();
    await prisma.userTradingState.deleteMany();
    await prisma.systemState.deleteMany();
    await prisma.userProfile.deleteMany();
  } catch (e: any) {
    console.warn("⚠️ Could not wipe tables (they may not exist yet).");
    console.warn("Run: npx prisma migrate deploy");
    throw e;
  }

  // Users
  const user = await prisma.userProfile.create({
    data: {
      email: "rebecca+dev@tradeaura.net",
      displayName: "Rebecca (Dev)",
      userState: {
        create: {
          selectedSymbol: "MGC",
          riskSettings: { riskUsd: 250, notes: "Dev default risk settings" },
        },
      },
      auditLogs: {
        create: [{ action: "SEED_INIT", data: { note: "Seeded initial dev user" } }],
      },
    },
  });

  const user2 = await prisma.userProfile.create({
    data: {
      email: "test+dev@tradeaura.net",
      displayName: "Test User (Dev)",
    },
  });

  // Broker accounts
  const acct1 = await prisma.brokerAccount.create({
    data: {
      userId: user.id,
      brokerName: "OANDA",
      accountLabel: "Dev OANDA Account",
      externalId: "OANDA-DEV-001",
    },
  });

  const acct2 = await prisma.brokerAccount.create({
    data: {
      userId: user2.id,
      brokerName: "Tradovate",
      accountLabel: "Dev Tradovate Account",
      externalId: "TRADOVATE-DEV-001",
    },
  });

  // Orders + fills (simple example)
  const order1 = await prisma.order.create({
    data: {
      brokerAccountId: acct1.id,
      externalId: "ORD-DEV-001",
      symbol: "MGC",
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      status: OrderStatus.FILLED,
      qty: "1",
      price: "2050.0",
      filledQty: "1",
      avgFillPrice: "2050.0",
      fills: {
        create: [
          {
            brokerAccountId: acct1.id,
            externalId: "FILL-DEV-001",
            symbol: "MGC",
            side: OrderSide.BUY,
            qty: "1",
            price: "2050.0",
          },
        ],
      },
    },
    include: { fills: true },
  });

  const order2 = await prisma.order.create({
    data: {
      brokerAccountId: acct2.id,
      externalId: "ORD-DEV-002",
      symbol: "MGC",
      side: OrderSide.SELL,
      type: OrderType.MARKET,
      status: OrderStatus.PLACED,
      qty: "2",
    },
  });

  // -----------------------------
  // Candles: seed MORE history
  // -----------------------------
  const SEED_15S_DAYS = Number(process.env.SEED_15S_DAYS ?? 7);   // 7 days of 15s by default
  const SEED_3M_DAYS = Number(process.env.SEED_3M_DAYS ?? 30);    // 30 days of 3m by default

  const nowMs = Date.now();

  const step15s = 15_000;
  const step3m = 180_000;

  const end15s = floorToMs(nowMs, step15s);
  const end3m = floorToMs(nowMs, step3m);

  const count15s = Math.floor((SEED_15S_DAYS * 24 * 60 * 60 * 1000) / step15s) + 1;
  const count3m = Math.floor((SEED_3M_DAYS * 24 * 60 * 60 * 1000) / step3m) + 1;

  const candles15s = genCandles({
    symbol: "MGC",
    timeframe: CandleTimeframe.S15,
    endMs: end15s,
    stepMs: step15s,
    count: count15s,
    startPrice: 2050,
    volatility: 0.35,
    volumeBase: 100,
  });

  const candles3m = genCandles({
    symbol: "MGC",
    timeframe: CandleTimeframe.M3,
    endMs: end3m,
    stepMs: step3m,
    count: count3m,
    startPrice: 2050,
    volatility: 1.2,
    volumeBase: 500,
  });

  const totalInserted = await createManyBatched(prisma, [...candles15s, ...candles3m], 5000);

  // Event logs
  await prisma.eventLog.createMany({
    data: [
      {
        type: "SEED",
        level: "INFO",
        message: "Seed completed successfully",
        data: { users: 2, accounts: 2 },
        userId: user.id,
        brokerAccountId: acct1.id,
        orderId: order1.id,
      },
      {
        type: "ORDER_PLACED",
        level: "INFO",
        message: "Order placed (dev seed)",
        data: { symbol: "MGC" },
        userId: user2.id,
        brokerAccountId: acct2.id,
        orderId: order2.id,
      },
    ],
  });

  // System state
  await prisma.systemState.create({
    data: {
      key: "seedVersion",
      value: { version: 2, seededAt: new Date().toISOString() },
    },
  });

  console.log("✅ Seed complete");
  console.log({
    user: user.email,
    acct1: acct1.brokerName,
    order1: order1.externalId,
    candles15s: candles15s.length,
    candles3m: candles3m.length,
    totalInserted,
    seed15sDays: SEED_15S_DAYS,
    seed3mDays: SEED_3M_DAYS,
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
