// src/app/api/notifications/test-trade-opened/route.ts

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import type { TradeOpenedEvent } from "@/lib/notifications/events";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await prisma.userProfile.upsert({
    where: { clerkUserId: userId },
    create: { clerkUserId: userId },
    update: {},
  });

  const now = new Date().toISOString();

  const event: TradeOpenedEvent = {
    type: "trade_opened",
    ts: now,
    userId,

    tradeId: `test-trade-${Date.now()}`,
    accountId: "test-account-001",
    symbol: "MGC",
    direction: "long",
    size: 1,
    entryTs: now,
    entryPrice: 2843.2,
  };

  const res = await notify(event, { prisma });

  return NextResponse.json({ ok: true, userId, tradeId: event.tradeId, notify: res });
}
