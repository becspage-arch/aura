// src/app/api/trading-state/status/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const state = await db.userTradingState.findUnique({
    where: { userId: user.id },
    select: { selectedBrokerAccountId: true },
  });

  const brokerAccountId = state?.selectedBrokerAccountId ?? null;
  if (!brokerAccountId) {
    return Response.json({
      ok: true,
      brokerAccountId: null,
      isPaused: false,
      isKillSwitched: false,
      brokerConnected: false,
      lastHeartbeatAt: null,
    });
  }

  const acct = await db.brokerAccount.findFirst({
    where: { id: brokerAccountId, userId: user.id },
    select: {
      id: true,
      isPaused: true,
      isKillSwitched: true,
      lastHeartbeatAt: true,
    },
  });

  if (!acct) {
    return Response.json({
      ok: true,
      brokerAccountId,
      isPaused: false,
      isKillSwitched: false,
      brokerConnected: false,
      lastHeartbeatAt: null,
    });
  }

  const HEARTBEAT_OK_MS = 120_000; // 2 minutes
  const hbMs = acct.lastHeartbeatAt ? acct.lastHeartbeatAt.getTime() : null;
  const brokerConnected = hbMs != null && Date.now() - hbMs <= HEARTBEAT_OK_MS;

  return Response.json({
    ok: true,
    brokerAccountId: acct.id,
    isPaused: acct.isPaused,
    isKillSwitched: acct.isKillSwitched,
    brokerConnected,
    lastHeartbeatAt: acct.lastHeartbeatAt?.toISOString?.() ?? null,
  });
}
