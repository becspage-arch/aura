// src/app/api/dev/manual-order/route.ts
import { NextResponse } from "next/server";
import Ably from "ably";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const contractId = String(body.contractId || "CON.F.US.MGC.J26");
    const side = body.side === "sell" ? "sell" : "buy";
    const size = Number.isFinite(Number(body.size)) ? Number(body.size) : 1;
    const stopLossTicks = Number.isFinite(Number(body.stopLossTicks))
      ? Number(body.stopLossTicks)
      : 20;
    const takeProfitTicks = Number.isFinite(Number(body.takeProfitTicks))
      ? Number(body.takeProfitTicks)
      : 20;

    const ablyKey = (process.env.ABLY_API_KEY || "").trim();
    if (!ablyKey) {
      return NextResponse.json(
        { ok: false, error: "Missing ABLY_API_KEY on app server" },
        { status: 500 }
      );
    }

    // IMPORTANT: this must match the worker's AURA_CLERK_USER_ID
    const clerkUserId = (process.env.AURA_CLERK_USER_ID || "").trim();
    if (!clerkUserId) {
      return NextResponse.json(
        { ok: false, error: "Missing AURA_CLERK_USER_ID on app server" },
        { status: 500 }
      );
    }

    // IMPORTANT: must match worker MANUAL_EXEC_TOKEN
    const manualToken = (process.env.MANUAL_EXEC_TOKEN || "").trim();
    if (!manualToken) {
      return NextResponse.json(
        { ok: false, error: "Missing MANUAL_EXEC_TOKEN on app server" },
        { status: 500 }
      );
    }

    const ably = new Ably.Realtime({ key: ablyKey });
    await new Promise<void>((resolve, reject) => {
      ably.connection.on("connected", () => resolve());
      ably.connection.on("failed", () => reject(new Error("Ably connection failed")));
    });

    const ch = ably.channels.get(`aura:exec:${clerkUserId}`);

    const payload = {
      token: manualToken,
      clerkUserId,
      contractId,
      side,
      size,
      stopLossTicks,
      takeProfitTicks,
    };

    await ch.publish("exec.manual_bracket", payload);

    ably.close();

    return NextResponse.json({
      ok: true,
      published: true,
      order: { contractId, side, size, stopLossTicks, takeProfitTicks },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
