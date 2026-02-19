// src/app/api/dashboard/summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

type SumRow = { v: string | null };
type PerfRow = {
  trade_count: bigint;
  wins: bigint;
  gross_profit: string | null;
  gross_loss_abs: string | null;
  avg_rr: string | null;
};
type DdRow = { max_dd: string | null; peak: string | null };
type DailyRow = { day: string; pnl: string };

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const userProfile = await prisma.userProfile.findFirst({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!userProfile) {
    return NextResponse.json({ ok: false, error: "user profile not found" }, { status: 404 });
  }

  const userState = await prisma.userTradingState.findUnique({
    where: { userId: userProfile.id },
    select: {
      isPaused: true,
      isKillSwitched: true,
      selectedSymbol: true,
      selectedBrokerAccountId: true,
    },
  });

  // ---- KPI sums (Europe/London day/month boundaries)
  const [todaySum] = await prisma.$queryRaw<SumRow[]>`
    SELECT COALESCE(SUM("realizedPnlUsd"), 0)::text AS v
    FROM "Trade"
    WHERE "clerkUserId" = ${clerkUserId}
      AND ("closedAt" AT TIME ZONE 'Europe/London')::date
          = (NOW() AT TIME ZONE 'Europe/London')::date
  `;

  const [monthSum] = await prisma.$queryRaw<SumRow[]>`
    SELECT COALESCE(SUM("realizedPnlUsd"), 0)::text AS v
    FROM "Trade"
    WHERE "clerkUserId" = ${clerkUserId}
      AND date_trunc('month', "closedAt" AT TIME ZONE 'Europe/London')
          = date_trunc('month', NOW() AT TIME ZONE 'Europe/London')
  `;

  const [totalSum] = await prisma.$queryRaw<SumRow[]>`
    SELECT COALESCE(SUM("realizedPnlUsd"), 0)::text AS v
    FROM "Trade"
    WHERE "clerkUserId" = ${clerkUserId}
  `;

  // ---- Performance 30d (rolling, based on closedAt)
  const [perf30] = await prisma.$queryRaw<PerfRow[]>`
    SELECT
      COUNT(*)::bigint AS trade_count,
      SUM(CASE WHEN "outcome" = 'WIN' THEN 1 ELSE 0 END)::bigint AS wins,
      COALESCE(SUM(CASE WHEN "realizedPnlUsd" > 0 THEN "realizedPnlUsd" ELSE 0 END), 0)::text AS gross_profit,
      COALESCE(ABS(SUM(CASE WHEN "realizedPnlUsd" < 0 THEN "realizedPnlUsd" ELSE 0 END)), 0)::text AS gross_loss_abs,
      AVG("rrAchieved")::text AS avg_rr
    FROM "Trade"
    WHERE "clerkUserId" = ${clerkUserId}
      AND "closedAt" >= (NOW() - INTERVAL '30 days')
  `;

  const tradeCount = Number(perf30?.trade_count ?? 0);
  const wins = Number(perf30?.wins ?? 0);
  const winRatePct = tradeCount > 0 ? (wins / tradeCount) * 100 : null;

  const grossProfit = Number(perf30?.gross_profit ?? 0);
  const grossLossAbs = Number(perf30?.gross_loss_abs ?? 0);
  const profitFactor = tradeCount > 0 && grossLossAbs > 0 ? grossProfit / grossLossAbs : null;

  const avgRR = perf30?.avg_rr ? Number(perf30.avg_rr) : null;

  // ---- Max drawdown 30d using daily equity curve (Europe/London days)
  const [dd] = await prisma.$queryRaw<DdRow[]>`
    WITH daily AS (
      SELECT
        ("closedAt" AT TIME ZONE 'Europe/London')::date AS day,
        SUM("realizedPnlUsd") AS pnl
      FROM "Trade"
      WHERE "clerkUserId" = ${clerkUserId}
        AND "closedAt" >= (NOW() - INTERVAL '30 days')
      GROUP BY 1
    ),
    curve AS (
      SELECT
        day,
        SUM(pnl) OVER (ORDER BY day) AS equity
      FROM daily
    ),
    peaks AS (
      SELECT
        day,
        equity,
        MAX(equity) OVER (ORDER BY day) AS peak
      FROM curve
    )
    SELECT
      COALESCE(MAX(peak - equity), 0)::text AS max_dd,
      COALESCE(MAX(peak), 0)::text AS peak
    FROM peaks
  `;

  const maxDrawdownUsdNum = dd?.max_dd ? Number(dd.max_dd) : 0;
  const peakNum = dd?.peak ? Number(dd.peak) : 0;
  const maxDrawdownUsd = tradeCount > 0 ? maxDrawdownUsdNum : null;
  const maxDrawdownPct = peakNum > 0 ? (maxDrawdownUsdNum / peakNum) * 100 : null;

  // ---- Cumulative chart (1Y) daily points (Europe/London days)
  const daily1Y = await prisma.$queryRaw<DailyRow[]>`
    SELECT
      ("closedAt" AT TIME ZONE 'Europe/London')::date::text AS day,
      COALESCE(SUM("realizedPnlUsd"), 0)::text AS pnl
    FROM "Trade"
    WHERE "clerkUserId" = ${clerkUserId}
      AND "closedAt" >= (NOW() - INTERVAL '1 year')
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  let cum = 0;
  const cumulativePoints = daily1Y.map((r) => {
    const pnl = Number(r.pnl);
    cum += pnl;
    return { day: r.day, pnlUsd: pnl.toFixed(2), cumulativeUsd: cum.toFixed(2) };
  });

  // ---- Month calendar (current month only, Europe/London)
  const monthDays = await prisma.$queryRaw<DailyRow[]>`
    SELECT
      ("closedAt" AT TIME ZONE 'Europe/London')::date::text AS day,
      COALESCE(SUM("realizedPnlUsd"), 0)::text AS pnl
    FROM "Trade"
    WHERE "clerkUserId" = ${clerkUserId}
      AND date_trunc('month', "closedAt" AT TIME ZONE 'Europe/London')
          = date_trunc('month', NOW() AT TIME ZONE 'Europe/London')
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  // ---- Recent trades (10)
  const recentTrades = await prisma.trade.findMany({
    where: { clerkUserId },
    orderBy: { closedAt: "desc" },
    take: 10,
    select: {
      closedAt: true,
      symbol: true,
      contractId: true,
      side: true,
      qty: true,
      entryPriceAvg: true,
      exitPriceAvg: true,
      realizedPnlUsd: true,
      rrAchieved: true,
      outcome: true,
      exitReason: true,
      execKey: true,
    },
  });

  // ---- lastTradeAt
  const lastTradeAt = recentTrades.length ? recentTrades[0].closedAt.toISOString() : null;

  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    clerkUserId,

    kpis: {
      todayPnlUsd: Number(todaySum?.v ?? 0).toFixed(2),
      monthPnlUsd: Number(monthSum?.v ?? 0).toFixed(2),
      totalProfitUsd: Number(totalSum?.v ?? 0).toFixed(2),
      accountEquityUsd: null,
    },

    status: {
      strategy: userState?.isPaused ? "PAUSED" : "ACTIVE",
      trading: userState?.isKillSwitched ? "STOPPED" : "LIVE",
      broker: "UNKNOWN",
      riskMode: "NORMAL",
      symbol: userState?.selectedSymbol ?? "MGC",
      selectedBrokerAccountId: userState?.selectedBrokerAccountId ?? null,
      lastTradeAt,
    },

    performance30d: {
      tradeCount,
      winRatePct,
      profitFactor,
      avgRR,
      maxDrawdownPct,
      maxDrawdownUsd: maxDrawdownUsd === null ? null : maxDrawdownUsd.toFixed(2),
    },

    charts: {
      cumulativePnl: { range: "1Y", points: cumulativePoints },
      monthCalendar: {
        month: new Date().toISOString().slice(0, 7),
        days: monthDays.map((r) => ({ day: r.day, pnlUsd: Number(r.pnl).toFixed(2) })),
      },
    },

    recentTrades: recentTrades.map((t) => ({
      closedAt: t.closedAt.toISOString(),
      symbol: t.symbol,
      contractId: t.contractId,
      side: t.side,
      qty: t.qty.toString(),
      entryPriceAvg: t.entryPriceAvg.toString(),
      exitPriceAvg: t.exitPriceAvg.toString(),
      realizedPnlUsd: t.realizedPnlUsd.toString(),
      rrAchieved: t.rrAchieved?.toString() ?? null,
      outcome: t.outcome,
      exitReason: t.exitReason,
      execKey: t.execKey,
    })),
  });
}
