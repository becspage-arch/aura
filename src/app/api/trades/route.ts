// src/app/api/trades/route.ts
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "../../../lib/db";

export const runtime = "nodejs";

// GET /api/trades?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const userId = user.id;

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
    orderBy: { closedAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ ok: true, trades });
}
