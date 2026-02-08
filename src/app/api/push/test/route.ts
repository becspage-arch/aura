// src/app/api/push/test/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma"; // adjust if your prisma client path differs

type Body = {
  title?: string;
  message?: string;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
  const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "MISSING_ONESIGNAL_ENV_VARS" },
      { status: 500 }
    );
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // ok to default
  }

  const title = (body.title || "Aura").trim();
  const message = (body.message || "Test push from Aura ✅").trim();

  const subs = await prisma.oneSignalPushSubscription.findMany({
    where: { userId },
    select: { subscriptionId: true },
  });

  const subscriptionIds = subs.map((s) => s.subscriptionId);
  if (subscriptionIds.length === 0) {
    return NextResponse.json({ ok: false, error: "NO_SUBSCRIPTIONS" }, { status: 400 });
  }

  // OneSignal Create Message API (push) using include_subscription_ids
  // Headings recommended for Web Push. :contentReference[oaicite:7]{index=7}
  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_subscription_ids: subscriptionIds,
      headings: { en: title },
      contents: { en: message },
      // Optional: open a specific page
      url: "https://tradeaura.net/app", // tweak if your real route differs
      isAnyWeb: true,
    }),
  });

  const data = await res.json().catch(() => ({} as unknown));

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: "ONESIGNAL_ERROR", status: res.status, data },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
