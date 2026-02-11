// src/app/api/push/test/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

type Body = {
  title?: string;
  message?: string;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHENTICATED" },
      { status: 401 }
    );
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
    // ok
  }

  const title = (body.title || "Aura").trim();
  const message = (body.message || "Test push from Aura ✅").trim();

  const subs = await prisma.oneSignalPushSubscription.findMany({
    where: { userId },
    select: { subscriptionId: true },
  });

  if (subs.length === 0) {
    return NextResponse.json(
      { ok: false, error: "NO_SUBSCRIPTIONS" },
      { status: 400 }
    );
  }

  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      include_subscription_ids: subs.map((s) => s.subscriptionId),
      headings: { en: title },
      contents: { en: message },
      url: "https://tradeaura.net/app",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "ONESIGNAL_ERROR",
        status: response.status,
        data,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
