// src/app/api/dev/manual-order/route.ts
import { NextResponse } from "next/server";
import Ably from "ably";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { publishInAppNotification } from "@/lib/notifications/inApp";

export async function POST(req: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }

    const ablyKey = (process.env.ABLY_API_KEY || "").trim();
    if (!ablyKey) {
      return NextResponse.json({ ok: false, error: "Missing ABLY_API_KEY on app server" }, { status: 500 });
    }

    // Map Clerk -> internal user
    const userProfile = await prisma.userProfile.findFirst({
      where: { clerkUserId },
      select: { id: true },
    });
    if (!userProfile) {
      return NextResponse.json({ ok: false, error: "user profile not found" }, { status: 404 });
    }

    // Resolve selected broker account
    const uts = await prisma.userTradingState.findUnique({
      where: { userId: userProfile.id },
      select: { selectedBrokerAccountId: true },
    });

    const selectedId = uts?.selectedBrokerAccountId ?? null;
    if (!selectedId) {
      return NextResponse.json({ ok: false, error: "No selected broker account" }, { status: 400 });
    }

    const acct = await prisma.brokerAccount.findFirst({
      where: { id: selectedId, userId: userProfile.id },
      select: { id: true, brokerName: true },
    });

    if (!acct) {
      return NextResponse.json({ ok: false, error: "Selected broker account not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({} as any));

    const contractId = String(body.contractId || "CON.F.US.MGC.J26");
    const side = body.side === "sell" ? "sell" : "buy";
    const size = Number.isFinite(Number(body.size)) ? Number(body.size) : 1;
    const stopLossTicks = Number.isFinite(Number(body.stopLossTicks)) ? Number(body.stopLossTicks) : 45;
    const takeProfitTicks = Number.isFinite(Number(body.takeProfitTicks)) ? Number(body.takeProfitTicks) : 45;

    // REST publish (stable)
    const ably = new Ably.Rest({ key: ablyKey });
    const channel = `aura:exec:${clerkUserId}:${acct.brokerName}:${acct.id}`;

    await ably.channels.get(channel).publish("exec", {
      type: "manualOrder",
      payload: { contractId, side, size, stopLossTicks, takeProfitTicks },
    });

    await publishInAppNotification(clerkUserId, {
      type: "trade_opened",
      title: "Aura - Manual Order",
      body: "Manual order submitted ✅",
      ts: new Date().toISOString(),
      deepLink: "/app/reports",
    });

    return NextResponse.json({
      ok: true,
      published: true,
      clerkUserIdUsed: clerkUserId,
      channel,
      order: { contractId, side, size, stopLossTicks, takeProfitTicks },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
