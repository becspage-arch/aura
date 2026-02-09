// src/app/api/dev/manual-order/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const contractId = String(body.contractId || "CON.F.US.MGC.J26");
    const side = body.side === "sell" ? "sell" : "buy";
    const size = Number.isFinite(Number(body.size)) ? Number(body.size) : 1;
    const stopLossTicks = Number.isFinite(Number(body.stopLossTicks)) ? Number(body.stopLossTicks) : 20;
    const takeProfitTicks = Number.isFinite(Number(body.takeProfitTicks)) ? Number(body.takeProfitTicks) : 20;

    // Temporary: returns what would be submitted.
    // Next step is wiring to the worker execution endpoint.
    return NextResponse.json({
      ok: true,
      order: { contractId, side, size, stopLossTicks, takeProfitTicks },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
