// src/app/api/dev/notifications/test-trade-closed-polished/route.ts
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";

export async function POST() {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const clerkUserId = user.id;

    // Lock to you only
    if (clerkUserId !== process.env.AURA_CLERK_USER_ID) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Ensure we have email saved
    const toEmail =
      user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress ||
      null;

    if (!toEmail) {
      return NextResponse.json(
        { ok: false, error: "No email found on Clerk user" },
        { status: 400 }
      );
    }

    const profile = await prisma.userProfile.findUnique({
      where: { clerkUserId },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json({ ok: false, error: "User profile not found" }, { status: 404 });
    }

    const brokerAccount = await prisma.brokerAccount.findFirst({
      where: { userId: profile.id },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!brokerAccount) {
      return NextResponse.json(
        { ok: false, error: "No broker account found - connect a broker account first" },
        { status: 400 }
      );
    }

    const now = new Date();
    const openedAt = new Date(now.getTime() - 240_000); // 4 minutes ago

    const trade = await prisma.trade.create({
      data: {
        clerkUserId,
        brokerAccountId: brokerAccount.id,

        execKey: `dev:polished:${clerkUserId}:${Date.now()}`,

        symbol: "MGC",
        contractId: "CON.F.US.MGC.J26",

        side: "BUY",
        qty: 1,

        openedAt,
        closedAt: now,
        durationSec: 240,

        plannedStopTicks: 45,
        plannedTakeProfitTicks: 90,
        plannedRiskUsd: 45,
        plannedRR: 2,

        entryPriceAvg: 2034.25,
        exitPriceAvg: 2038.75,
        realizedPnlTicks: 18,
        realizedPnlUsd: 72.5,
        rrAchieved: 1.6,

        exitReason: "TP",
        outcome: "WIN",
      },
      select: { id: true, symbol: true },
    });

    // Fire notify with the REAL tradeId
    const event = {
      type: "trade_closed" as const,
      ts: now.toISOString(),
      userId: clerkUserId,

      tradeId: trade.id,
      accountId: "dev_account",
      symbol: trade.symbol,
      direction: "long" as const,

      entryTs: openedAt.toISOString(),
      exitTs: now.toISOString(),

      realisedPnlUsd: 72.5,
      result: "win" as const,
      strategyRunId: "dev_polished",
    };

    const result = await notify(event, { prisma });

    return NextResponse.json({ ok: true, tradeId: trade.id, result });
  } catch (err: any) {
    console.error("TEST_TRADE_CLOSED_POLISHED_FAILED", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
