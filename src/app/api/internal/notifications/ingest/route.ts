import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import type { NotificationEvent } from "@/lib/notifications/events";

// Worker (canonical) payload shape
type AuraEventBase = {
  name: string;
  ts: string;
  broker?: string;
  clerkUserId?: string;
  data?: any;
};

// Legacy payload shape (what notify() expects)
type LegacyNotifyEvent = {
  type: string;
  userId: string;
  ts?: string;
  broker?: string;
  [k: string]: any;
};

function isAuraEventBase(x: any): x is AuraEventBase {
  return !!x && typeof x === "object" && typeof x.name === "string" && typeof x.ts === "string";
}

function isLegacyNotifyEvent(x: any): x is LegacyNotifyEvent {
  return !!x && typeof x === "object" && typeof x.type === "string" && typeof x.userId === "string";
}

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

    const body = await req.json().catch(() => null);

    // Accept either:
    // - Worker canonical { name, ts, clerkUserId, data }
    // - Legacy { type, userId, ... }
    let event: any = null;

    if (isAuraEventBase(body)) {
      // normalize to legacy NotificationEvent shape for notify()
      const legacyType = String(body.name || "").replace(/\./g, "_");

      event = {
        type: legacyType, // "trade.closed" -> "trade_closed"
        userId: body.clerkUserId,
        ts: body.ts,
        broker: body.broker,
        ...(body.data ?? {}),
      };
    } else if (isLegacyNotifyEvent(body)) {
      event = body;
    } else {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    // Final guard (userId is required for notifications)
    if (!event.userId || typeof event.userId !== "string") {
      return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
    }

    const result = await notify(event as NotificationEvent, { prisma });
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("NOTIFY_INGEST_FAILED", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
