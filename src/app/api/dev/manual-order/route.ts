// src/app/api/dev/manual-order/route.ts
import { NextResponse } from "next/server";
import Ably from "ably";
import { auth } from "@clerk/nextjs/server";
import { publishInAppNotification } from "@/lib/notifications/inApp";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "unauthenticated" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({} as any));

    const contractId = String(body.contractId || "CON.F.US.MGC.J26");
    const side = body.side === "sell" ? "sell" : "buy";
    const size = Number.isFinite(Number(body.size)) ? Number(body.size) : 1;
    const stopLossTicks = Number.isFinite(Number(body.stopLossTicks))
      ? Number(body.stopLossTicks)
      : 45;
    const takeProfitTicks = Number.isFinite(Number(body.takeProfitTicks))
      ? Number(body.takeProfitTicks)
      : 45;

    const ablyKey = (process.env.ABLY_API_KEY || "").trim();
    if (!ablyKey) {
      return NextResponse.json(
        { ok: false, error: "Missing ABLY_API_KEY on app server" },
        { status: 500 }
      );
    }

    const manualToken = (process.env.MANUAL_EXEC_TOKEN || "").trim();
    if (!manualToken) {
      return NextResponse.json(
        { ok: false, error: "Missing MANUAL_EXEC_TOKEN on app server" },
        { status: 500 }
      );
    }

    const payload = {
      token: manualToken,
      clerkUserId: userId,
      contractId,
      side,
      size,
      stopLossTicks,
      takeProfitTicks,
    };

    // ✅ REST publish - no hanging serverless connections
    const ably = new Ably.Rest({ key: ablyKey });
    await ably.channels.get(`aura:exec:${userId}`).publish(
      "exec.manual_bracket",
      payload
    );

    await publishInAppNotification(userId, {
      type: "trade_opened",
      title: "Aura - Manual Order",
      body: "Manual order submitted ✅",
      ts: new Date().toISOString(),
      deepLink: "/app/reports",
    });

    return NextResponse.json({
      ok: true,
      published: true,
      clerkUserIdUsed: userId,
      channel: `aura:exec:${userId}`,
      order: { contractId, side, size, stopLossTicks, takeProfitTicks },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
