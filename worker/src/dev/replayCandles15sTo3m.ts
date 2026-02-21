// worker/src/dev/replayCandles15sTo3m.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { onClosed15sUpdate3m, flush3mForSymbol } from "../candles/deriveCandle3m.js";

// If you already publish to Ably inside your worker's emitSafe, you can swap this
// for the real emitSafe import and just call that.
async function emitSafe(evt: { name: string; ts: string; broker: string; data?: any }) {
  console.log(JSON.stringify(evt));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string, def?: string) => {
    const idx = args.indexOf(`--${k}`);
    if (idx === -1) return def;
    return args[idx + 1] ?? def;
  };

  return {
    symbol: get("symbol", "CON.F.US.MGC.J26")!,
    minutes: Number(get("minutes", "180")!),
  };
}

async function main() {
  const { symbol, minutes } = parseArgs();
  const db = new PrismaClient();

  const nowSec = Math.floor(Date.now() / 1000);
  const start = nowSec - minutes * 60;

  const rows = await db.candle15s.findMany({
    where: { symbol, time: { gte: start } },
    orderBy: { time: "asc" },
    select: { symbol: true, time: true, open: true, high: true, low: true, close: true },
  });

  console.log(
    `[replay] symbol=${symbol} rows=${rows.length} range=${start}..${nowSec} (${minutes}m)`
  );

  for (const r of rows) {
    await onClosed15sUpdate3m({
      db,
      candle: {
        symbol: r.symbol,
        time: r.time,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
      },
      emit3mClosed: async (c3) => {
        await emitSafe({
          name: "candle.3m.closed",
          ts: new Date().toISOString(),
          broker: "replay",
          data: c3,
        });
      },
    });
  }

  // flush any last partial bucket at the end of replay
  await flush3mForSymbol({
    db,
    symbol,
    emit3mClosed: async (c3) => {
      await emitSafe({
        name: "candle.3m.closed",
        ts: new Date().toISOString(),
        broker: "replay",
        data: c3,
      });
    },
  });

  await db.$disconnect();
  console.log("[replay] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
