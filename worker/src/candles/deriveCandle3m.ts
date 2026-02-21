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

type BuilderState = {
  bucketTime: number; // 3m bucket start time (epoch sec)
  open: number;
  high: number;
  low: number;
  close: number;
  firstTime: number; // first 15s candle time seen in this bucket
  lastTime: number; // last 15s candle time seen in this bucket
  count: number; // number of 15s candles seen in this bucket
};

const perSymbol = new Map<string, BuilderState>();

export async function onClosed15sUpdate3m(params: {
  db: PrismaClient;
  candle: Candle15s;

  emit3mClosed: (data: {
    symbol: string;
    time: number; // bucket start (epoch sec)
    open: number;
    high: number;
    low: number;
    close: number;
    count15s: number;
    first15sTime: number;
    last15sTime: number;
    // optional flags for debugging/observability
    isBackfill?: boolean;
  }) => Promise<void>;
}) {
  const { db, candle, emit3mClosed } = params;

  const b = bucket3m(candle.time);
  const key = candle.symbol;
  const cur = perSymbol.get(key);

  // First candle for this symbol -> start bucket
  if (!cur) {
    perSymbol.set(key, {
      bucketTime: b,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      firstTime: candle.time,
      lastTime: candle.time,
      count: 1,
    });
    return;
  }

  // Out-of-order / duplicate 15s candle: ignore to avoid corrupting state
  if (candle.time <= cur.lastTime) {
    return;
  }

  // Same 3m bucket -> update running OHLC
  if (b === cur.bucketTime) {
    cur.high = Math.max(cur.high, candle.high);
    cur.low = Math.min(cur.low, candle.low);
    cur.close = candle.close;
    cur.lastTime = candle.time;
    cur.count += 1;
    return;
  }

  // Bucket changed -> finalize previous bucket
  await finalizeBucket({
    db,
    emit3mClosed,
    symbol: key,
    state: cur,
    isBackfill: false,
  });

  // If the feed jumped forward across multiple 3m buckets, fill the missing ones.
  // Example: cur.bucketTime=1000, new b=1540 => fill 1180, 1360.
  let t = cur.bucketTime + 180;
  const lastClose = cur.close;

  while (t < b) {
    const filler: BuilderState = {
      bucketTime: t,
      open: lastClose,
      high: lastClose,
      low: lastClose,
      close: lastClose,
      // We didn’t see any 15s candles for this bucket.
      firstTime: t,
      lastTime: t + 165,
      count: 0,
    };

    await finalizeBucket({
      db,
      emit3mClosed,
      symbol: key,
      state: filler,
      isBackfill: true,
    });

    t += 180;
  }

  // Start new bucket with current 15s candle
  perSymbol.set(key, {
    bucketTime: b,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    firstTime: candle.time,
    lastTime: candle.time,
    count: 1,
  });
}

async function finalizeBucket(params: {
  db: PrismaClient;
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
  symbol: string;
  state: BuilderState;
  isBackfill: boolean;
}) {
  const { db, emit3mClosed, symbol, state, isBackfill } = params;

  await upsertCandle3m({
    db,
    symbol,
    time: state.bucketTime,
    open: state.open,
    high: state.high,
    low: state.low,
    close: state.close,
  });

  await emit3mClosed({
    symbol,
    time: state.bucketTime,
    open: state.open,
    high: state.high,
    low: state.low,
    close: state.close,
    count15s: state.count,
    first15sTime: state.firstTime,
    last15sTime: state.lastTime,
    isBackfill,
  });
}

async function upsertCandle3m(params: {
  db: PrismaClient;
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}) {
  const { db, symbol, time, open, high, low, close } = params;

  const id = `c3m_${symbol}_${time}`;

  await db.candle3m.upsert({
    where: { symbol_time: { symbol, time } },
    create: {
      id,
      symbol,
      time,
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
}

export async function flush3mForSymbol(params: {
  db: PrismaClient;
  symbol: string;
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
    isFlush?: boolean;
  }) => Promise<void>;
}) {
  const { db, symbol, emit3mClosed } = params;

  const cur = perSymbol.get(symbol);
  if (!cur) return;

  await upsertCandle3m({
    db,
    symbol,
    time: cur.bucketTime,
    open: cur.open,
    high: cur.high,
    low: cur.low,
    close: cur.close,
  });

  await emit3mClosed({
    symbol,
    time: cur.bucketTime,
    open: cur.open,
    high: cur.high,
    low: cur.low,
    close: cur.close,
    count15s: cur.count,
    first15sTime: cur.firstTime,
    last15sTime: cur.lastTime,
    isFlush: true,
  });
}
