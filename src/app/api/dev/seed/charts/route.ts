import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEV ONLY seed endpoint.
 * Inserts sample candles (15s + 3m) and a sample order + fill for marker testing.
 *
 * Safety:
 * - Only enabled when NODE_ENV !== "production"
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const symbol = "MGC";

  const nowSec = Math.floor(Date.now() / 1000);
  const start15 = Math.floor((nowSec - 60 * 30) / 180) * 180; // last 30 mins aligned to 3m (and therefore 15s too)

  // --- Seed 15s candles (120 candles = 30 minutes) ---
  const candles15: Array<{
    symbol: string;
    timeframe: "S15";
    ts: Date;
    open: any;
    high: any;
    low: any;
    close: any;
    volume: any;
  }> = [];

  let price = 2050; // arbitrary baseline
  for (let i = 0; i < 120; i++) {
    const t = start15 + i * 15;

    // simple deterministic walk
    const drift = Math.sin(i / 7) * 0.4;
    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + 0.25;
    const low = Math.min(open, close) - 0.25;
    const vol = 1 + (i % 5);

    candles15.push({
      symbol,
      timeframe: "S15",
      ts: new Date(t * 1000),
      open,
      high,
      low,
      close,
      volume: vol,
    });

    price = close;
  }

  // --- Derive 3m candles from 15s (10 candles = 30 minutes) ---
  const candles3: Array<{
    symbol: string;
    timeframe: "M3";
    ts: Date;
    open: any;
    high: any;
    low: any;
    close: any;
    volume: any;
  }> = [];

  for (let b = 0; b < 10; b++) {
    const bucketStart = start15 + b * 180;
    const slice = candles15.filter(
      (c) =>
        c.ts.getTime() / 1000 >= bucketStart &&
        c.ts.getTime() / 1000 < bucketStart + 180
    );
    if (!slice.length) continue;

    const open = slice[0].open;
    const close = slice[slice.length - 1].close;
    const high = Math.max(...slice.map((c) => Number(c.high)));
    const low = Math.min(...slice.map((c) => Number(c.low)));
    const volume = slice.reduce((sum, c) => sum + Number(c.volume ?? 0), 0);

    candles3.push({
      symbol,
      timeframe: "M3",
      ts: new Date(bucketStart * 1000),
      open,
      high,
      low,
      close,
      volume,
    });
  }

  // Use upsert to avoid duplicate unique constraint issues
  const candleOps = [
    ...candles15.map((c) =>
      prisma.candle.upsert({
        where: { symbol_timeframe_ts: { symbol: c.symbol, timeframe: c.timeframe, ts: c.ts } },
        create: c as any,
        update: c as any,
      })
    ),
    ...candles3.map((c) =>
      prisma.candle.upsert({
        where: { symbol_timeframe_ts: { symbol: c.symbol, timeframe: c.timeframe, ts: c.ts } },
        create: c as any,
        update: c as any,
      })
    ),
  ];

  // --- Seed a dummy broker account (needed for FK) ---
  // We'll create a local UserProfile if none exists.
  const user = await prisma.userProfile.upsert({
    where: { clerkUserId: "dev" },
    create: { clerkUserId: "dev", email: "dev@local" },
    update: {},
  });

  const account = await prisma.brokerAccount.upsert({
    where: { brokerName_externalId: { brokerName: "DEV", externalId: "DEV-001" } },
    create: {
      userId: user.id,
      brokerName: "DEV",
      externalId: "DEV-001",
      accountLabel: "Dev Account",
    },
    update: { userId: user.id, accountLabel: "Dev Account" },
  });

    // 0) Clean existing DEV candles so 3m timestamps are guaranteed aligned
  await prisma.candle.deleteMany({
    where: { symbol, timeframe: "M3" },
  });

  // 1) Upsert candles FIRST so they definitely exist for the marker bucket
  await Promise.all(candleOps);

  // 2) Delete previous DEV markers so the newest marker is always the one we seed
  await prisma.fill.deleteMany({
    where: {
      brokerAccountId: account.id,
      symbol,
      externalId: { startsWith: "DEV-" },
    } as any,
  });

  await prisma.order.deleteMany({
    where: {
      brokerAccountId: account.id,
      symbol,
      externalId: { startsWith: "DEV-" },
    } as any,
  });

  // 3) Seed an order + fill near the END of the candle series (so it maps to a candle you just created)
  const end15 = start15 + (120 - 1) * 15; // last 15s candle open time
  const orderCreatedSec = end15 - 60; // ~1 minute before the last candle
  const fillCreatedSec = orderCreatedSec + 15; // next 15s bucket (still within range)

  const order = await prisma.order.create({
    data: {
      brokerAccountId: account.id,
      externalId: `DEV-ORDER-${orderCreatedSec}`,
      symbol,
      side: "BUY",
      type: "MARKET",
      status: "FILLED",
      qty: 1 as any,
      filledQty: 1 as any,
      avgFillPrice: 2050.5 as any,
      createdAt: new Date(orderCreatedSec * 1000),
      updatedAt: new Date(fillCreatedSec * 1000),
    },
  });

  const fill = await prisma.fill.create({
    data: {
      brokerAccountId: account.id,
      orderId: order.id,
      externalId: `DEV-FILL-${fillCreatedSec}`,
      symbol,
      side: "BUY",
      qty: 1 as any,
      price: 2050.5 as any,
      createdAt: new Date(fillCreatedSec * 1000),
    },
  });

  return NextResponse.json({
    ok: true,
    symbol,
    seeded: {
      candles15: candles15.length,
      candles3: candles3.length,
      start15,
      end15,
      orderId: order.id,
      fillId: fill.id,
      brokerAccountId: account.id,
      userId: user.id,
    },
  });
}
