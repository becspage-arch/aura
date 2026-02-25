// src/app/api/accounts/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/user-profile";

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  // Ensure we have a UserProfile row (DB may be empty after reset)
  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const accounts = await prisma.brokerAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      brokerName: true,
      accountLabel: true,
      externalId: true,
      isEnabled: true,
      isPaused: true,
      pausedAt: true,
      isKillSwitched: true,
      killSwitchedAt: true,
      lastHeartbeatAt: true,
      config: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, accounts });
}
