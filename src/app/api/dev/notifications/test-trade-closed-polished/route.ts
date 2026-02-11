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
      user.emailAddresses?.[0]?.emailAddress;

    if (!toEmail) {
      return NextResponse.json({ ok: false, error: "No email on Clerk user" }, { status: 400 });
    }

    await prisma.userProfile.upsert({
      where: { clerkUserId },
      create: { clerkUserId, email: toEmail },
      update: { email: toEmail },
    });

    // Create a real Trade row so the polished email can pull entry/exit/qty/prices
    const now = new Date();
    const openedAt = new Date(now.getTime() - 4 * 60 * 1000);

    const trade = await prisma.trade.create({
      data: {
        clerkUserId,
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
