// src/app/api/system/health/route.ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/user-profile";

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  // 1️⃣ Selected account
  const state = await prisma.userTradingState.findUnique({
    where: { userId: user.id },
    select: { selectedBrokerAccountId: true },
  });

  const brokerAccountId = state?.selectedBrokerAccountId ?? null;

  if (!brokerAccountId) {
    return Response.json({
      ok: true,
      db: true,
      brokerAccountId: null,
      brokerConnected: false,
      isPaused: false,
      isKillSwitched: false,
      strategyActive: false,
    });
  }

  // 2️⃣ Account status
  const acct = await prisma.brokerAccount.findFirst({
    where: { id: brokerAccountId, userId: user.id },
    select: {
      isPaused: true,
      isKillSwitched: true,
      lastHeartbeatAt: true,
    },
  });

  const HEARTBEAT_OK_MS = 120_000;
  const hbMs = acct?.lastHeartbeatAt?.getTime?.() ?? null;
  const brokerConnected =
    hbMs != null && Date.now() - hbMs <= HEARTBEAT_OK_MS;

  // 3️⃣ Strategy active (derived: connected + not paused + not killed)
  const strategyActive =
    brokerConnected &&
    !acct?.isPaused &&
    !acct?.isKillSwitched;

  return Response.json({
    ok: true,
    db: true,
    brokerAccountId,
    brokerConnected,
    isPaused: acct?.isPaused ?? false,
    isKillSwitched: acct?.isKillSwitched ?? false,
    strategyActive,
    lastHeartbeatAt: acct?.lastHeartbeatAt?.toISOString?.() ?? null,
  });
}
