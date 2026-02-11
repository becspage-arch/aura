import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import type { NotificationEvent } from "@/lib/notifications/events";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("x-aura-token") || "";
    const expected = (process.env.NOTIFY_INGEST_TOKEN || "").trim();

    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "Server missing NOTIFY_INGEST_TOKEN" },
        { status: 500 }
      );
    }

    if (!token || token !== expected) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const event = (await req.json()) as NotificationEvent;

    // Basic shape guard (keeps it simple)
    if (!event || typeof (event as any).type !== "string" || typeof (event as any).userId !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const result = await notify(event, { prisma });
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("NOTIFY_INGEST_FAILED", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
