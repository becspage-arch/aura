// src/app/api/settings/notification-preferences/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

function defaults() {
  return {
    tradeClosedWins: true,
    tradeClosedLosses: true,
    dailySummary: false,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const profile = await prisma.userProfile.findUnique({
    where: { clerkUserId: userId },
    select: { id: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "UserProfile not found" }, { status: 404 });
  }

  const prefs = await prisma.notificationPreferences.upsert({
    where: { userId: profile.id },
    update: {},
    create: { userId: profile.id, ...defaults() },
    select: {
      tradeClosedWins: true,
      tradeClosedLosses: true,
      dailySummary: true,
    },
  });

  return NextResponse.json({ prefs });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const profile = await prisma.userProfile.findUnique({
    where: { clerkUserId: userId },
    select: { id: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "UserProfile not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  const next = {
    tradeClosedWins: typeof body.tradeClosedWins === "boolean" ? body.tradeClosedWins : undefined,
    tradeClosedLosses: typeof body.tradeClosedLosses === "boolean" ? body.tradeClosedLosses : undefined,
    dailySummary: typeof body.dailySummary === "boolean" ? body.dailySummary : undefined,
  };

  const prefs = await prisma.notificationPreferences.upsert({
    where: { userId: profile.id },
    update: next,
    create: { userId: profile.id, ...defaults(), ...next },
    select: {
      tradeClosedWins: true,
      tradeClosedLosses: true,
      dailySummary: true,
    },
  });

  return NextResponse.json({ prefs });
}
