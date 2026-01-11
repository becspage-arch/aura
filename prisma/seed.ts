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
  const url = getDbUrl();
  // basic safety: refuse to seed if explicitly flagged as prod or if URL looks like prod main
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in NODE_ENV=production.");
  }
  // If you want stronger checks later (e.g., match branch hostnames), we can add them.
}

async function main() {
  assertNotProduction();

  const adapter = new PrismaPg({ connectionString: getDbUrl() });
  const prisma = new PrismaClient({ adapter });

  // Optional: start from a clean slate (dev only)
  // Comment these out if you don't want deletes.
  // await prisma.fill.deleteMany();
  // await prisma.order.deleteMany();
  // await prisma.brokerAccount.deleteMany();
  // await prisma.auditLog.deleteMany();
  // await prisma.eventLog.deleteMany();
  // await prisma.candle.deleteMany();
  // await prisma.userTradingState.deleteMany();
  // await prisma.systemState.deleteMany();
  // await prisma.userProfile.deleteMany();
    // Optional: start from a clean slate (dev only)
  // If tables don't exist yet, guide the user instead of crashing.
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
        create: [
          { action: "SEED_INIT", data: { note: "Seeded initial dev user" } },
        ],
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

  // Candles (tiny dataset: last ~10 points each timeframe)
  const now = new Date();
  const baseTs = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago

  const candles15s = Array.from({ length: 20 }).map((_, i) => {
    const ts = new Date(baseTs.getTime() + i * 15_000);
    const open = 2050 + i * 0.1;
    const close = open + (i % 2 === 0 ? 0.05 : -0.03);
    const high = Math.max(open, close) + 0.08;
    const low = Math.min(open, close) - 0.07;

    return {
      symbol: "MGC",
      timeframe: CandleTimeframe.S15,
      ts,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: (100 + i).toString(),
    };
  });

  const candles3m = Array.from({ length: 10 }).map((_, i) => {
    const ts = new Date(baseTs.getTime() + i * 180_000);
    const open = 2050 + i * 0.4;
    const close = open + (i % 2 === 0 ? 0.2 : -0.15);
    const high = Math.max(open, close) + 0.25;
    const low = Math.min(open, close) - 0.22;

    return {
      symbol: "MGC",
      timeframe: CandleTimeframe.M3,
      ts,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: (500 + i * 10).toString(),
    };
  });

  await prisma.candle.createMany({ data: [...candles15s, ...candles3m] });

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
      value: { version: 1, seededAt: new Date().toISOString() },
    },
  });

  console.log("✅ Seed complete");
  console.log({ user: user.email, acct1: acct1.brokerName, order1: order1.externalId });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
