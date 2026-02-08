// src/app/api/push/subscribe/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma"; // adjust if your prisma client path differs

type Body = {
  subscriptionId: string;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const subscriptionId = (body.subscriptionId || "").trim();
  if (!subscriptionId) {
    return NextResponse.json({ ok: false, error: "MISSING_SUBSCRIPTION_ID" }, { status: 400 });
  }

  // Upsert by subscriptionId:
  // - If it already exists, ensure it belongs to this user (move it if needed)
  // - If not, create it
  await prisma.oneSignalPushSubscription.upsert({
    where: { subscriptionId },
    update: { userId },
    create: { userId, subscriptionId },
  });

  return NextResponse.json({ ok: true });
}
