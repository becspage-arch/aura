// src/app/api/dashboard/summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

function startOfDayLondon(d: Date) {
  const london = new Date(
    d.toLocaleString("en-GB", { timeZone: "Europe/London" })
  );
  london.setHours(0, 0, 0, 0);
  return london;
}

function startOfMonthLondon(d: Date) {
  const london = new Date(
    d.toLocaleString("en-GB", { timeZone: "Europe/London" })
  );
  london.setDate(1);
  london.setHours(0, 0, 0, 0);
  return london;
}

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

  const now = new Date();
  const startOfToday = startOfDayLondon(now);
  const startOfMonth = startOfMonthLondon(now);

  const trades = await prisma.trade.findMany({
    where: { clerkUserId },
    orderBy: { closedAt: "asc" },
  });

  // ---------------------------
  // KPI CALCULATIONS
  // ---------------------------

  let totalProfit = 0;
  let todayProfit = 0;
  let monthProfit = 0;

  for (const t of trades) {
    const pnl = Number(t.realizedPnlUsd);
    totalProfit += pnl;

    if (t.closedAt >= startOfToday) {
      todayProfit += pnl;
    }

    if (t.closedAt >= startOfMonth) {
      monthProfit += pnl;
    }
  }

  // ---------------------------
  // PERFORMANCE (30D)
  // ---------------------------

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const trades30 = trades.filter(t => t.closedAt >= thirtyDaysAgo);

  const tradeCount = trades30.length;
  const wins = trades30.filter(t => t.outcome === "WIN").length;

  const grossProfit = trades30
    .filter(t => Number(t.realizedPnlUsd) > 0)
    .reduce((sum, t) => sum + Number(t.realizedPnlUsd), 0);

  const grossLoss = trades30
    .filter(t => Number(t.realizedPnlUsd) < 0)
    .reduce((sum, t) => sum + Number(t.realizedPnlUsd), 0);

  const winRatePct = tradeCount > 0 ? (wins / tradeCount) * 100 : null;
  const profitFactor =
    grossLoss !== 0 ? grossProfit / Math.abs(grossLoss) : null;

  const avgRR =
    trades30
      .filter(t => t.rrAchieved !== null)
      .reduce((sum, t, _, arr) => sum + Number(t.rrAchieved ?? 0) / arr.length, 0) || null;

  // Max drawdown (30d equity curve)
  let running = 0;
  let peak = 0;
  let maxDd = 0;

  for (const t of trades30) {
    running += Number(t.realizedPnlUsd);
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDd) maxDd = dd;
  }

  const maxDrawdownUsd = maxDd || null;
  const maxDrawdownPct =
    peak > 0 ? (maxDd / peak) * 100 : null;

  // ---------------------------
  // CHART (1Y cumulative)
  // ---------------------------

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const trades1Y = trades.filter(t => t.closedAt >= oneYearAgo);

  const dailyMap = new Map<string, number>();

  for (const t of trades1Y) {
    const day = t.closedAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) || 0) + Number(t.realizedPnlUsd));
  }

  const sortedDays = Array.from(dailyMap.keys()).sort();

  let cumulative = 0;
  const cumulativePoints = sortedDays.map(day => {
    const pnl = dailyMap.get(day) || 0;
    cumulative += pnl;
    return {
      day,
      pnlUsd: pnl.toFixed(2),
      cumulativeUsd: cumulative.toFixed(2),
    };
  });

  // ---------------------------
  // RECENT TRADES
  // ---------------------------

  const recentTrades = trades
    .slice(-10)
    .reverse()
    .map(t => ({
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
    }));

  const userState = await prisma.userTradingState.findUnique({
    where: { userId: userProfile.id },
  });

  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    kpis: {
      todayPnlUsd: todayProfit.toFixed(2),
      monthPnlUsd: monthProfit.toFixed(2),
      totalProfitUsd: totalProfit.toFixed(2),
      accountEquityUsd: null,
    },
    status: {
      strategy: userState?.isPaused ? "PAUSED" : "ACTIVE",
      trading: userState?.isKillSwitched ? "STOPPED" : "LIVE",
      broker: "UNKNOWN",
      riskMode: "NORMAL",
      symbol: userState?.selectedSymbol ?? "MGC",
      selectedBrokerAccountId: userState?.selectedBrokerAccountId ?? null,
      lastTradeAt: trades.length
        ? trades[trades.length - 1].closedAt.toISOString()
        : null,
    },
    performance30d: {
      tradeCount,
      winRatePct,
      profitFactor,
      avgRR,
      maxDrawdownPct,
      maxDrawdownUsd: maxDrawdownUsd?.toFixed(2) ?? null,
    },
    charts: {
      cumulativePnl: {
        range: "1Y",
        points: cumulativePoints,
      },
      monthCalendar: {
        month: now.toISOString().slice(0, 7),
        days: sortedDays.map(day => ({
          day,
          pnlUsd: (dailyMap.get(day) || 0).toFixed(2),
        })),
      },
    },
    recentTrades,
  });
}
