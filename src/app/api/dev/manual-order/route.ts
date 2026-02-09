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

    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing ABLY_API_KEY on the app server" },
        { status: 500 }
      );
    }

    const ably = new Ably.Rest({ key: apiKey });
    const channel = ably.channels.get("aura:exec");

    const cmd = {
      type: "manualOrder",
      ts: new Date().toISOString(),
      payload: { contractId, side, size, stopLossTicks, takeProfitTicks },
    };

    await channel.publish("exec", cmd);

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
