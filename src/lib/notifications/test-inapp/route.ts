// src/app/api/notifications/test-inapp/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { publishInAppNotification } from "@/lib/notifications/inApp";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  await publishInAppNotification(userId, {
    type: "test",
    title: "Aura",
    body: "In-app toast test ✅",
    ts: new Date().toISOString(),
    deepLink: "/app",
  });

  return NextResponse.json({ ok: true });
}
