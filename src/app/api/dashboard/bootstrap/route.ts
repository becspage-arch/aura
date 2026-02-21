// src/app/api/dashboard/bootstrap/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

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

  const accounts = await prisma.brokerAccount.findMany({
    where: { userId: userProfile.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      brokerName: true,
      accountLabel: true,
      externalId: true,
    },
  });

  const tradingState = await prisma.userTradingState.findUnique({
    where: { userId: userProfile.id },
    select: {
      isPaused: true,
      isKillSwitched: true,
      killSwitchedAt: true,
      selectedBrokerAccountId: true,
      selectedSymbol: true,
    },
  });

  return NextResponse.json({
    ok: true,
    accounts,
    tradingState: {
      isPaused: tradingState?.isPaused ?? false,
      isKillSwitched: tradingState?.isKillSwitched ?? false,
      killSwitchedAt: tradingState?.killSwitchedAt ? tradingState.killSwitchedAt.toISOString() : null,
      selectedBrokerAccountId: tradingState?.selectedBrokerAccountId ?? null,
      selectedSymbol: tradingState?.selectedSymbol ?? null,
    },
  });
}
