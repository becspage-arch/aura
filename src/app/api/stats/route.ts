// src/app/api/stats/route.ts
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import * as Db from "../../../lib/db";

export const runtime = "nodejs";

// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: Request) {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const userId = user.id;

    const prisma: any = (Db as any).prisma ?? (Db as any).db;
    if (!prisma?.trade?.findMany) {
      return NextResponse.json(
        {
          ok: false,
          error: "DB_IMPORT_FAILED",
          message: "Db.prisma/Db.db not available (or missing Trade model).",
          availableExports: Object.keys(Db as any),
        },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // Default: last 30 days
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : defaultFrom;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : now;

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ ok: false, error: "INVALID_DATE" }, { status: 400 });
    }

    const trades = await prisma.trade.findMany({
      where: {
        clerkUserId: userId,
        closedAt: { gte: fromDate, lte: toDate },
      },
      select: {
        realizedPnlUsd: true,
        outcome: true,
        rrAchieved: true,
        closedAt: true,
      },
      orderBy: { closedAt: "asc" },
      take: 2000,
    });

    let netPnlUsd = 0;
    let wins = 0;
    let losses = 0;
    let breakevens = 0;

    let rrSum = 0;
    let rrCount = 0;

    for (const t of trades) {
      const pnl = Number(t.realizedPnlUsd);
      netPnlUsd += pnl;

      if (t.outcome === "WIN") wins++;
      else if (t.outcome === "LOSS") losses++;
      else breakevens++;

      if (t.rrAchieved !== null && t.rrAchieved !== undefined) {
        rrSum += Number(t.rrAchieved);
        rrCount++;
      }
    }

    const denom = wins + losses;
    const winRate = denom > 0 ? wins / denom : 0;
    const avgR = rrCount > 0 ? rrSum / rrCount : 0;

    return NextResponse.json({
      ok: true,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      trades: trades.length,
      wins,
      losses,
      breakevens,
      winRate,
      netPnlUsd,
      avgR,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
