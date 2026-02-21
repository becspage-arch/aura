// src/app/api/trading-state/pause/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";
import { publishToUser } from "@/lib/ably/server";
import { writeAuditLog, writeEventLog } from "@/lib/logging/server";
import { notify } from "@/lib/notifications/notify";

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
      killSwitchedAt: null,
    });
  }

  const acct = await db.brokerAccount.findFirst({
    where: { id: brokerAccountId, userId: user.id },
    select: {
      id: true,
      isPaused: true,
      isKillSwitched: true,
      killSwitchedAt: true,
    },
  });

  if (!acct) {
    return Response.json({
      ok: true,
      brokerAccountId,
      isPaused: false,
      isKillSwitched: false,
      killSwitchedAt: null,
    });
  }

  return Response.json({
    ok: true,
    brokerAccountId,
    isPaused: acct.isPaused,
    isKillSwitched: acct.isKillSwitched,
    killSwitchedAt: acct.killSwitchedAt?.toISOString?.() ?? null,
  });
}

async function handleSetPause(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const isPaused = Boolean((body as any)?.isPaused);

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
    return new Response("No broker account selected", { status: 400 });
  }

  const currentAcc = await db.brokerAccount.findFirst({
    where: { id: brokerAccountId, userId: user.id },
    select: { id: true, isPaused: true },
  });

  if (!currentAcc) {
    return new Response("Broker account not found", { status: 404 });
  }

  const prevPaused = currentAcc.isPaused;

  await db.brokerAccount.update({
    where: { id: brokerAccountId },
    data: {
      isPaused,
      pausedAt: isPaused ? new Date() : null,
    },
    select: { id: true },
  });

  await writeAuditLog(user.id, "TRADING_PAUSE_TOGGLED", {
    brokerAccountId,
    isPaused,
  });

  await writeEventLog({
    type: "control_changed",
    level: "info",
    message: `Pause set to ${isPaused}`,
    data: { brokerAccountId, isPaused },
    userId: user.id,
    brokerAccountId,
  });

  await publishToUser(clerkUserId, "status_update", { isPaused });

  // Only notify if changed (best-effort)
  if (prevPaused !== isPaused) {
    try {
      await notify(
        {
          type: "strategy_status_changed",
          userId: clerkUserId,
          ts: new Date().toISOString(),
          isPaused,
        } as any,
        { prisma: db as any }
      );
    } catch (err) {
      console.error("STRATEGY_STATUS_NOTIFY_FAILED", err);
    }
  }

  return Response.json({ ok: true, brokerAccountId, isPaused });
}

export async function POST(req: Request) {
  return handleSetPause(req);
}

export async function PUT(req: Request) {
  return handleSetPause(req);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { Allow: "GET,POST,PUT,OPTIONS" },
  });
}
