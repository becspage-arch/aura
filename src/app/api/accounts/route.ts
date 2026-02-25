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

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const [accounts, state] = await Promise.all([
    prisma.brokerAccount.findMany({
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
    }),
    prisma.userTradingState.findUnique({
      where: { userId: user.id },
      select: { selectedBrokerAccountId: true },
    }),
  ]);

  const selectedBrokerAccountId = state?.selectedBrokerAccountId ?? null;
  const selectedAccount =
    selectedBrokerAccountId != null
      ? accounts.find((a) => a.id === selectedBrokerAccountId) ?? null
      : null;

  return NextResponse.json({
    ok: true,
    accounts,
    selectedBrokerAccountId,
    selectedAccount,
  });
}