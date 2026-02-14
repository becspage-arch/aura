// src/app/api/charts/candles/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Timeframe } from "@/lib/time/timeframes";
import { TF_SECONDS, floorToTf } from "@/lib/time/timeframes";

/**
 * Response candle shape:
 * - time is epoch seconds (UTC), candle OPEN time
 * - all OHLC are numbers
 */
type ApiCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

// Accept both canonical API tfs and DB-ish aliases
const QuerySchema = z.object({
  symbol: z.string().min(1),
  tf: z.enum(["15s", "3m", "S15", "M3"]).default("15s"),
  to: z.string().optional(), // epoch seconds
  limit: z.string().optional(), // number
  fill: z.string().optional(), // "1" to forward-fill gaps
});

function parseNumber(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * For Candle15s rows, time is already epoch SECONDS (UTC), open time.
 */
function normalizeCandle15sRow(row: any): ApiCandle {
  return {
    time: Number(row.time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? undefined : Number(row.volume),
  };
}

/**
 * Map incoming tf value to API tf.
 */
function normalizeTf(tfRaw: string): { apiTf: Timeframe } {
  const v = (tfRaw ?? "15s").toString().trim().toLowerCase();
  if (v === "3m" || v === "m3") return { apiTf: "3m" };
  return { apiTf: "15s" };
}

function forwardFill15s(candles: ApiCandle[]): ApiCandle[] {
  if (candles.length <= 1) return candles;

  const out: ApiCandle[] = [];
  const step = 15; // seconds

  for (let i = 0; i < candles.length; i++) {
    const cur = candles[i];
    out.push(cur);

    const next = candles[i + 1];
    if (!next) break;

    let t = cur.time + step;
    while (t < next.time) {
      const px = out[out.length - 1].close;
      out.push({
        time: t,
        open: px,
        high: px,
        low: px,
        close: px,
      });
      t += step;
    }
  }

  return out;
}

function forwardFillStep(candles: ApiCandle[], stepSec: number): ApiCandle[] {
  if (candles.length <= 1) return candles;

  const out: ApiCandle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const cur = candles[i];
    out.push(cur);

    const next = candles[i + 1];
    if (!next) break;

    let t = cur.time + stepSec;
    while (t < next.time) {
      const px = out[out.length - 1].close;
      out.push({
        time: t,
        open: px,
        high: px,
        low: px,
        close: px,
      });
      t += stepSec;
    }
  }

  return out;
}

/**
 * Derive 3m candles by grouping 15s candles into 12-candle buckets.
 * Bucket open times are aligned to 3m boundaries (multiples of 180s).
 *
 * Notes:
 * - If a 3m bucket has no 15s rows, we OMIT it here (sparse).
 * - If fill=1, we forward-fill missing 3m buckets AFTER derivation.
 */
function derive3mFrom15s(rows15s: ApiCandle[], from3m: number, to3m: number): ApiCandle[] {
  const out: ApiCandle[] = [];
  const BUCKET = 180; // 3m
  const LAST_15S_IN_BUCKET = 165; // 0..165 step 15

  // rows15s expected sorted asc
  let idx = 0;

  for (let t = from3m; t <= to3m; t += BUCKET) {
    const bucketStart = t;
    const bucketEnd = t + LAST_15S_IN_BUCKET;

    while (idx < rows15s.length && rows15s[idx].time < bucketStart) idx++;

    let j = idx;
    const bucketRows: ApiCandle[] = [];
    while (j < rows15s.length && rows15s[j].time <= bucketEnd) {
      if (rows15s[j].time >= bucketStart) bucketRows.push(rows15s[j]);
      j++;
    }

    if (bucketRows.length === 0) continue;

    const open = bucketRows[0].open;
    let high = bucketRows[0].high;
    let low = bucketRows[0].low;
    const close = bucketRows[bucketRows.length - 1].close;

    for (let k = 0; k < bucketRows.length; k++) {
      high = Math.max(high, bucketRows[k].high);
      low = Math.min(low, bucketRows[k].low);
    }

    out.push({
      time: bucketStart,
      open,
      high,
      low,
      close,
    });

    idx = j;
  }

  return out;
}

async function getLatest15sTime(symbol: string): Promise<number | null> {
  const last = await prisma.candle15s.findFirst({
    where: { symbol },
    orderBy: { time: "desc" },
    select: { time: true },
  });
  return last?.time != null ? Number(last.time) : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const tfParam = searchParams.get("timeframe") ?? searchParams.get("tf") ?? "15s";

  const parsed = QuerySchema.safeParse({
    symbol: searchParams.get("symbol") ?? "",
    tf: tfParam as any,
    to: searchParams.get("to") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    fill: searchParams.get("fill") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  // IMPORTANT: do NOT uppercase, because contractId symbols are case-sensitive strings
  const symbol = parsed.data.symbol.trim();
  const { apiTf } = normalizeTf(parsed.data.tf);

  const limit = clamp(parseNumber(parsed.data.limit, 800), 1, 2000);
  const fill = parsed.data.fill === "1";

  const nowSec = Math.floor(Date.now() / 1000);
  const toSecRequested = parseNumber(parsed.data.to, nowSec);

  const step = TF_SECONDS[apiTf]; // 15 or 180

  // Helper to compute window boundaries
  const computeWindow = (toSec: number) => {
    const toAligned = floorToTf(toSec, apiTf);
    const fromAligned = toAligned - (limit - 1) * step;
    return { toAligned, fromAligned };
  };

  try {
    // ✅ 15s: read directly from Candle15s
    if (apiTf === "15s") {
      let { toAligned, fromAligned } = computeWindow(toSecRequested);

      let rows = await prisma.candle15s.findMany({
        where: { symbol, time: { gte: fromAligned, lte: toAligned } },
        orderBy: { time: "asc" },
        take: limit,
      });

      // 🔁 Fallback for market-closed gaps: jump to latest available candle
      if (rows.length === 0) {
        const latest = await getLatest15sTime(symbol);
        if (latest == null) {
          return NextResponse.json({ symbol, tf: apiTf, candles: [], nextTo: null, filled: fill });
        }

        ({ toAligned, fromAligned } = computeWindow(latest));
        rows = await prisma.candle15s.findMany({
          where: { symbol, time: { gte: fromAligned, lte: toAligned } },
          orderBy: { time: "asc" },
          take: limit,
        });
      }

      let candles = rows.map(normalizeCandle15sRow);
      if (fill) candles = forwardFill15s(candles);

      const nextTo = candles.length ? candles[0].time - step : null;

      return NextResponse.json({ symbol, tf: apiTf, candles, nextTo, filled: fill });
    }

    // ✅ 3m: derive from Candle15s server-side
    if (apiTf === "3m") {
      let { toAligned, fromAligned } = computeWindow(toSecRequested);

      const fetchDerived = async (toAligned3m: number, fromAligned3m: number) => {
        const to15s = toAligned3m + 165;
        const from15s = fromAligned3m;

        const rows15s = await prisma.candle15s.findMany({
          where: { symbol, time: { gte: from15s, lte: to15s } },
          orderBy: { time: "asc" },
        });

        let derived = derive3mFrom15s(rows15s.map(normalizeCandle15sRow), fromAligned3m, toAligned3m);
        if (fill) derived = forwardFillStep(derived, 180);

        return derived;
      };

      let derived = await fetchDerived(toAligned, fromAligned);

      // 🔁 Fallback for market-closed gaps: jump to latest available 15s candle, then align to 3m
      if (derived.length === 0) {
        const latest15s = await getLatest15sTime(symbol);
        if (latest15s == null) {
          return NextResponse.json({ symbol, tf: apiTf, candles: [], nextTo: null, filled: fill });
        }

        ({ toAligned, fromAligned } = computeWindow(latest15s));
        derived = await fetchDerived(toAligned, fromAligned);
      }

      const nextTo = derived.length ? derived[0].time - 180 : null;

      return NextResponse.json({ symbol, tf: apiTf, candles: derived, nextTo, filled: fill });
    }

    return NextResponse.json({ error: "Unsupported tf" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to load candles", detail: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
