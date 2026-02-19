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

  const state = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, isPaused: false, isKillSwitched: false },
  });

  return Response.json({
    ok: true,
    isPaused: state.isPaused,
    isKillSwitched: state.isKillSwitched,
    killSwitchedAt: state.killSwitchedAt,
  });
}

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const isPaused = Boolean((body as any)?.isPaused);

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  // Read current state so we only notify on real changes
  const current = await db.userTradingState.findUnique({
    where: { userId: user.id },
    select: { isPaused: true, isKillSwitched: true },
  });

  const prevPaused = current?.isPaused ?? false;
  const prevKill = current?.isKillSwitched ?? false;

  const next = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: { isPaused },
    create: { userId: user.id, isPaused, isKillSwitched: false },
  });

  await writeAuditLog(user.id, "TRADING_PAUSE_TOGGLED", { isPaused });

  await writeEventLog({
    type: "control_changed",
    level: "info",
    message: `Pause set to ${isPaused}`,
    data: { isPaused },
    userId: user.id,
  });

  // realtime status for UI topbar etc.
  await publishToUser(clerkUserId, "status_update" as any, {
    isPaused: next.isPaused,
    isKillSwitched: next.isKillSwitched,
  });

  // 🔔 Only notify if it changed (best-effort: NEVER break pause/run UX)
  if (prevPaused !== next.isPaused || prevKill !== next.isKillSwitched) {
    try {
      await notify(
        {
          type: "strategy_status_changed",
          userId: clerkUserId, // notify expects Clerk userId
          ts: new Date().toISOString(),
          isPaused: next.isPaused,
          isKillSwitched: next.isKillSwitched,
        } as any,
        { prisma: db as any }
      );
    } catch (err) {
      console.error("STRATEGY_STATUS_NOTIFY_FAILED", err);
    }
  }

  return Response.json({
    ok: true,
    isPaused: next.isPaused,
    isKillSwitched: next.isKillSwitched,
  });
}
