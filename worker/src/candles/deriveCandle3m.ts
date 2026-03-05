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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isBucketComplete(params: {
  bucketStart: number;
  rows: Array<{ time: number }>;
}) {
  const { bucketStart, rows } = params;
  if (rows.length !== 12) return false;
  const first = rows[0]?.time;
  const last = rows[rows.length - 1]?.time;
  return first === bucketStart && last === bucketStart + 165;
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
  const offset = candle.time - bucketStart;
  const isEndOfBucketTick = offset === 165;

  // Fetch rows for this bucket (source of truth)
  const fetchRows = async () =>
    db.candle15s.findMany({
      where: {
        symbol: candle.symbol,
        time: { gte: bucketStart, lt: bucketStart + 180 },
      },
      orderBy: { time: "asc" },
      select: { time: true, open: true, high: true, low: true, close: true },
    });

  let rows = await fetchRows();

  // If we’re at the end-of-bucket tick, allow a few tight retries to avoid the proven ~ms race
  if (!isBucketComplete({ bucketStart, rows }) && isEndOfBucketTick) {
    for (let i = 0; i < 6; i++) {
      await sleep(75);
      rows = await fetchRows();
      if (isBucketComplete({ bucketStart, rows })) break;
    }
  }

  // Only upsert when we can PROVE the bucket is complete and aligned
  if (!isBucketComplete({ bucketStart, rows })) {
    return;
  }

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