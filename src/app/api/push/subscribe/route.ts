// src/app/api/push/subscribe/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

type Body = {
  subscriptionId: string;
  onesignalId?: string | null;
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

  const onesignalId = (body.onesignalId || "").trim() || null;

  await prisma.oneSignalPushSubscription.upsert({
    where: { subscriptionId },
    update: { userId, onesignalId },
    create: { userId, subscriptionId, onesignalId },
  });

  return NextResponse.json({ ok: true });
}
