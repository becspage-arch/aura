// src/app/api/notifications/test-trade-closed/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications/notify";
import type { TradeClosedEvent } from "@/lib/notifications/events";

export async function POST() {
  // Pick the most recently created user profile as a simple local/dev default.
  // (We’ll lock this to the logged-in user later.)
  const user = await prisma.userProfile.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "No UserProfile found in DB." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const event: TradeClosedEvent = {
    type: "trade_closed",
    ts: now,
    userId: user.clerkUserId ?? user.id, // use what you have; we’ll standardise later

    tradeId: `test-trade-${Date.now()}`,
    accountId: "test-account-001",
    symbol: "MGC",
    direction: "long",
    entryTs: now,
    exitTs: now,
    realisedPnlUsd: 186,
    result: "win",
  };

  const res = await notify(event, { prisma });

  return NextResponse.json({ ok: true, userId: event.userId, notify: res });
}
