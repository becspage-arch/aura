import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { to15sBucket } from "@/lib/charts/markerTime";

const qSchema = z.object({
  symbol: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(2000).default(300),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = qSchema.parse({
      symbol: searchParams.get("symbol"),
      limit: searchParams.get("limit") ?? undefined,
    });

    const [orders, fills] = await Promise.all([
      prisma.order.findMany({
        where: { symbol: parsed.symbol },
        orderBy: { createdAt: "desc" },
        take: parsed.limit,
      }),
      prisma.fill.findMany({
        where: { symbol: parsed.symbol },
        orderBy: { createdAt: "desc" },
        take: parsed.limit,
      }),
    ]);

    const markers = [
      ...orders.map((o) => {
        const side = o.side === "BUY" ? "order_buy" : "order_sell";
        const t = Math.floor(new Date(o.createdAt).getTime() / 1000);
        return {
          id: `order:${o.id}`,
          symbol: o.symbol,
          time: to15sBucket(t),
          tf: "15s",
          kind: o.status === "CANCELLED" ? "order_cancelled" : side,
          price: o.price ? Number(o.price) : undefined,
          label: `${o.side} ${o.qty}`,
          brokerAccountId: o.brokerAccountId,
          orderId: o.id,
          fillId: null,
        };
      }),
      ...fills.map((f) => {
        const t = Math.floor(new Date(f.createdAt).getTime() / 1000);
        const side = f.side === "BUY" ? "buy" : "sell";
        // We’ll treat fills as "full" for now; partial/full refinement comes in 7.8.6
        const kind = side === "buy" ? "fill_buy_full" : "fill_sell_full";
        return {
          id: `fill:${f.id}`,
          symbol: f.symbol,
          time: to15sBucket(t),
          tf: "15s",
          kind,
          price: Number(f.price),
          label: `FILL ${f.qty}`,
          brokerAccountId: f.brokerAccountId,
          orderId: f.orderId ?? null,
          fillId: f.id,
        };
      }),
    ];

    // Deduplicate + sort ascending by time
    const byId = new Map<string, any>();
    for (const m of markers) byId.set(m.id, m);
    const out = Array.from(byId.values()).sort((a, b) => a.time - b.time);

    return NextResponse.json({ symbol: parsed.symbol, markers: out });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load markers", detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
