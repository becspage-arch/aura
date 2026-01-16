import { PrismaClient } from "@prisma/client";

type Candle15sClosed = {
  symbol: string;      // e.g. "MES" (our internal symbol label)
  t0: number;          // ms epoch bucket open (your aggregator uses ms)
  o: number;
  h: number;
  l: number;
  c: number;
  // volume optional for now
};

export async function upsertCandle15s(prisma: PrismaClient, x: Candle15sClosed) {
  // Candle15s.time is epoch SECONDS in schema
  const timeSec = Math.floor(x.t0 / 1000);

  return prisma.candle15s.upsert({
    where: {
      symbol_time: {
        symbol: x.symbol,
        time: timeSec,
      },
    },
    create: {
      symbol: x.symbol,
      time: timeSec,
      open: x.o,
      high: x.h,
      low: x.l,
      close: x.c,
      // volume: null,
    },
    update: {
      open: x.o,
      high: x.h,
      low: x.l,
      close: x.c,
      // volume: null,
    },
  });
}
