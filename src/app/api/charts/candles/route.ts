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
});

function parseNumber(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function toEpochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function normalizeDecimalRow(row: any): ApiCandle {
  // Prisma returns ts: Date and numeric fields possibly as Decimal-like
  return {
    time: toEpochSeconds(row.ts),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? undefined : Number(row.volume),
  };
}

/**
 * Map incoming tf value to:
 * - API tf: "15s" | "3m" (what we return)
 * - DB timeframe: "S15" | "M3" (what prisma.candle stores)
 */
function normalizeTf(tfRaw: string): { apiTf: Timeframe; dbTf: "S15" | "M3" } {
  const v = (tfRaw ?? "15s").toString().trim().toLowerCase();

  if (v === "15s" || v === "s15") return { apiTf: "15s", dbTf: "S15" };
  if (v === "3m" || v === "m3") return { apiTf: "3m", dbTf: "M3" };

  // fallback to 15s
  return { apiTf: "15s", dbTf: "S15" };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // accept both `tf` and `timeframe`
  const tfParam = searchParams.get("timeframe") ?? searchParams.get("tf") ?? "15s";

  const parsed = QuerySchema.safeParse({
    symbol: searchParams.get("symbol") ?? "",
    tf: tfParam as any,
    to: searchParams.get("to") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const symbol = parsed.data.symbol.toUpperCase();
  const { apiTf, dbTf } = normalizeTf(parsed.data.tf);

  const limit = clamp(parseNumber(parsed.data.limit, 800), 1, 2000);

  const nowSec = Math.floor(Date.now() / 1000);
  const toSec = parseNumber(parsed.data.to, nowSec);

  // Align `to` to the requested API timeframe ("15s" or "3m")
  const toAligned = floorToTf(toSec, apiTf);
  const toDate = new Date(toAligned * 1000);

  try {
    const rows = await prisma.candle.findMany({
      where: { symbol, timeframe: dbTf as any, ts: { lt: toDate } },
      orderBy: { ts: "desc" },
      take: limit,
    });

    const candles = rows.map(normalizeDecimalRow).reverse();
    const nextTo = candles.length ? candles[0].time : null;

    return NextResponse.json({
      symbol,
      tf: apiTf,
      candles,
      nextTo,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to load candles", detail: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
