// src/app/api/dashboard/summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";

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

type RangeKey = "1M" | "3M" | "6M" | "1Y" | "ALL";

function normalizeRange(v: string | null): RangeKey {
  const s = (v || "").toUpperCase().trim();
  if (s === "1M" || s === "3M" || s === "6M" || s === "1Y" || s === "ALL") return s;
  return "1Y";
}

function rangeIntervalSql(range: RangeKey): Prisma.Sql {
  // Only used for cumulative chart windowing.
  // ALL = no filter.
  switch (range) {
    case "1M":
      return Prisma.sql`AND "closedAt" >= (NOW() - INTERVAL '30 days')`;
    case "3M":
      return Prisma.sql`AND "closedAt" >= (NOW() - INTERVAL '90 days')`;
    case "6M":
      return Prisma.sql`AND "closedAt" >= (NOW() - INTERVAL '180 days')`;
    case "1Y":
      return Prisma.sql`AND "closedAt" >= (NOW() - INTERVAL '1 year')`;
    case "ALL":
    default:
      return Prisma.empty;
  }
}

export async function GET(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const range = normalizeRange(url.searchParams.get("range"));
  const rangeWhere = rangeIntervalSql(range);

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

  const selectedAccount = userState?.selectedBrokerAccountId
    ? await prisma.brokerAccount.findUnique({
        where: { id: userState.selectedBrokerAccountId },
        select: { id: true, brokerName: true, lastHeartbeatAt: true },
      })
    : null;

  const HEARTBEAT_OK_MS = 120_000; // 2 minutes
  const nowMs = Date.now();
  const hbMs = selectedAccount?.lastHeartbeatAt
    ? selectedAccount.lastHeartbeatAt.getTime()
    : null;

  const brokerConnected = hbMs != null && nowMs - hbMs <= HEARTBEAT_OK_MS;

  // Latest broker-sourced equity snapshot (Step 6)
  const latestSnapshot = selectedAccount?.id
    ? await prisma.accountSnapshot.findFirst({
        where: { brokerAccountId: selectedAccount.id },
        orderBy: { createdAt: "desc" },
        select: { equityUsd: true },
      })
    : null;

  const accountEquityUsdNum =
    latestSnapshot?.equityUsd != null ? Number(latestSnapshot.equityUsd) : null;

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

  // ---- Cumulative chart (range-controlled) daily points (Europe/London days)
  const dailyRange = await prisma.$queryRaw<DailyRow[]>`
    SELECT
      ("closedAt" AT TIME ZONE 'Europe/London')::date::text AS day,
      COALESCE(SUM("realizedPnlUsd"), 0)::text AS pnl
    FROM "Trade"
    WHERE "clerkUserId" = ${clerkUserId}
      ${rangeWhere}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  let cum = 0;
  const cumulativePoints = dailyRange.map((r) => {
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
      id: true,
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

  const lastTradeAt = recentTrades.length ? recentTrades[0].closedAt.toISOString() : null;

  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    clerkUserId,

    kpis: {
      todayPnlUsd: Number(todaySum?.v ?? 0).toFixed(2),
      monthPnlUsd: Number(monthSum?.v ?? 0).toFixed(2),
      totalProfitUsd: Number(totalSum?.v ?? 0).toFixed(2),
      accountEquityUsd: accountEquityUsdNum === null ? null : accountEquityUsdNum.toFixed(2),
    },

    status: {
      strategy: userState?.isPaused ? "PAUSED" : "ACTIVE",
      trading: userState?.isKillSwitched ? "STOPPED" : "LIVE",
      broker: selectedAccount?.brokerName ?? "UNKNOWN",
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
      cumulativePnl: { range, points: cumulativePoints },
      monthCalendar: {
        month: new Date().toISOString().slice(0, 7),
        days: monthDays.map((r) => ({ day: r.day, pnlUsd: Number(r.pnl).toFixed(2) })),
      },
    },

    recentTrades: recentTrades.map((t) => ({
      tradeId: t.id,
      execKey: t.execKey,
      timeIso: t.closedAt.toISOString(),

      pair: t.symbol, // keep simple now; later can show "MGC" + contractId tooltip etc
      type: t.side === "BUY" ? "Long" : "Short",

      entryPrice: t.entryPriceAvg.toString(),
      exitPrice: t.exitPriceAvg.toString(),
      pnlUsd: t.realizedPnlUsd.toString(),
      rr: t.rrAchieved?.toString() ?? null,

      qty: t.qty.toString(),
      status:
        t.outcome === "WIN" ? "Won" : t.outcome === "LOSS" ? "Lost" : t.outcome === "BREAKEVEN" ? "Breakeven" : "—",
      exitReason: t.exitReason,
    })),
  });
}
