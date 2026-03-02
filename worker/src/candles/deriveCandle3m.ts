// worker/src/candles/deriveCandle3m.ts
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

type Candle15s = {
  symbol: string;
  time: number; // epoch seconds (15s aligned)
  open: number;
  high: number;
  low: number;
  close: number;
};

function toDec(n: number) {
  return new Prisma.Decimal(n);
}

function bucket3m(tSec: number) {
  return Math.floor(tSec / 180) * 180;
}

export async function onClosed15sUpdate3m(params: {
  db: PrismaClient;
  candle: Candle15s;

  emit3mClosed: (data: {
    symbol: string;
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    count15s: number;
    first15sTime: number;
    last15sTime: number;
    isBackfill?: boolean;
  }) => Promise<void>;
}) {
  const { db, candle, emit3mClosed } = params;

  const bucketStart = bucket3m(candle.time);

  // Only attempt derive when last 15s of bucket arrives
  const offset = candle.time - bucketStart;
  const isLast15sOfBucket = offset === 165;

  if (!isLast15sOfBucket) {
    return;
  }

  // Fetch 15s rows for this bucket from DB (source of truth)
  const rows = await db.candle15s.findMany({
    where: {
      symbol: candle.symbol,
      time: {
        gte: bucketStart,
        lt: bucketStart + 180,
      },
    },
    orderBy: { time: "asc" },
  });

  if (rows.length === 0) {
    return;
  }

  console.log("[c3m] DERIVE_ATTEMPT", {
    symbol: candle.symbol,
    bucketStart,
    triggering15sTime: candle.time,
    rows: rows.length,
    firstTime: rows[0]?.time ?? null,
    lastTime: rows[rows.length - 1]?.time ?? null,
  });

  const open = Number(rows[0].open);
  const close = Number(rows[rows.length - 1].close);

  let high = Number(rows[0].high);
  let low = Number(rows[0].low);

  for (const r of rows) {
    high = Math.max(high, Number(r.high));
    low = Math.min(low, Number(r.low));
  }

  await db.candle3m.upsert({
    where: { symbol_time_3m: { symbol: candle.symbol, time: bucketStart } },
    create: {
      id: `c3m_${candle.symbol}_${bucketStart}`,
      symbol: candle.symbol,
      time: bucketStart,
      open: toDec(open),
      high: toDec(high),
      low: toDec(low),
      close: toDec(close),
    },
    update: {
      open: toDec(open),
      high: toDec(high),
      low: toDec(low),
      close: toDec(close),
    },
  });

  await emit3mClosed({
    symbol: candle.symbol,
    time: bucketStart,
    open,
    high,
    low,
    close,
    count15s: rows.length,
    first15sTime: rows[0].time,
    last15sTime: rows[rows.length - 1].time,
  });
}

// Flush no longer needed – keep as noop for compatibility
export async function flush3mForSymbol() {
  return;
}
