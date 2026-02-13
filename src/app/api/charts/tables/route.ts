// src/app/api/charts/tables/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId: clerkUserId } = auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const userProfile = await prisma.userProfile.findFirst({
    where: { clerkUserId },
    select: { id: true, clerkUserId: true },
  });

  if (!userProfile) {
    return NextResponse.json({ ok: false, error: "user profile not found" }, { status: 404 });
  }

  const [executions, trades] = await Promise.all([
    prisma.execution.findMany({
      where: { userId: userProfile.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        createdAt: true,
        execKey: true,
        brokerName: true,
        contractId: true,
        symbol: true,
        side: true,
        qty: true,
        stopLossTicks: true,
        takeProfitTicks: true,
        status: true,
        entryOrderId: true,
        stopOrderId: true,
        tpOrderId: true,
        error: true,
      },
    }),

    prisma.trade.findMany({
      where: { clerkUserId },
      orderBy: { closedAt: "desc" },
      take: 50,
      select: {
        closedAt: true,
        execKey: true,
        symbol: true,
        contractId: true,
        side: true,
        qty: true,
        realizedPnlUsd: true,
        outcome: true,
        exitReason: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    executions,
    trades,
  });
}
