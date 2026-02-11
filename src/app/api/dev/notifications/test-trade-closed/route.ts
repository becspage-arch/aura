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

    // Ensure we have the email saved (safety)
    const toEmail =
      user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress;

    if (toEmail) {
      await prisma.userProfile.upsert({
        where: { clerkUserId },
        create: { clerkUserId, email: toEmail },
        update: { email: toEmail },
      });
    }

    // Fire a fake trade_closed event through the real notify pipeline
    const event = {
      type: "trade_closed" as const,
      ts: new Date().toISOString(),
      userId: clerkUserId,
      tradeId: "dev_test_trade_1",
      accountId: "dev_account",
      symbol: "MGC",
      direction: "long" as const,
      entryTs: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      exitTs: new Date().toISOString(),
      realisedPnlUsd: 123,
      result: "win" as const,
      strategyRunId: "dev",
    };

    const result = await notify(event, { prisma });

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("TEST_TRADE_CLOSED_FAILED", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
