// src/app/api/dashboard/network/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

type SumRow = { v: string | null };
type CountRow = { n: bigint };
type PctRow = { pct: string | null };

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  // 1) Active traders (last 30 days) = distinct users with any closed trades
  const [active] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(DISTINCT "clerkUserId")::bigint AS n
    FROM "Trade"
    WHERE "closedAt" >= (NOW() - INTERVAL '30 days')
  `;

  // 2) Signals today (Europe/London)
  const [signals] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::bigint AS n
    FROM "StrategySignal"
    WHERE ("createdAt" AT TIME ZONE 'Europe/London')::date
          = (NOW() AT TIME ZONE 'Europe/London')::date
  `;

  // 3) Total profit (all traders, all time)
  const [profit] = await prisma.$queryRaw<SumRow[]>`
    SELECT COALESCE(SUM("realizedPnlUsd"), 0)::text AS v
    FROM "Trade"
  `;

  // 4) Network uptime (last 24h) = % minutes where we saw a worker heartbeat.
  // NOTE: Until you add the worker heartbeat writer, this will return ~0% (or null if no rows match).
  const [uptime] = await prisma.$queryRaw<PctRow[]>`
    WITH mins AS (
      SELECT generate_series(
        date_trunc('minute', NOW() - INTERVAL '24 hours'),
        date_trunc('minute', NOW()),
        INTERVAL '1 minute'
      ) AS m
    ),
    ok AS (
      SELECT
        mins.m,
        EXISTS (
          SELECT 1
          FROM "EventLog" e
          WHERE e."type" = 'worker_heartbeat'
            AND e."createdAt" >= mins.m
            AND e."createdAt" <  mins.m + INTERVAL '1 minute'
        ) AS up
      FROM mins
    )
    SELECT
      (100.0 * SUM(CASE WHEN up THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0))::text AS pct
    FROM ok
  `;

  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    network: {
      activeTraders30d: Number(active?.n ?? 0),
      uptimePct24h: uptime?.pct == null ? null : Number(Number(uptime.pct).toFixed(1)),
      signalsToday: Number(signals?.n ?? 0),
      totalProfitAllTradersUsd: Number(profit?.v ?? 0).toFixed(2),
    },
  });
}
