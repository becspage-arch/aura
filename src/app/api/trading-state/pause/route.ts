// src/app/api/trading-state/pause/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { prisma } from "@/lib/prisma";
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
    create: { userId: user.id, isPaused: false },
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
  const isPaused = Boolean(body?.isPaused);

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  // Read current state so we only notify on real changes
  const current = await db.userTradingState.findUnique({
    where: { userId: user.id },
    select: { isPaused: true },
  });

  const prevPaused = current?.isPaused ?? false;

  const next = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: { isPaused },
    create: { userId: user.id, isPaused },
  });

  await writeAuditLog(user.id, "TRADING_PAUSE_TOGGLED", { isPaused });

  await writeEventLog({
    type: "control_changed",
    level: "info",
    message: `Pause set to ${isPaused}`,
    data: { isPaused },
    userId: user.id,
  });

  await publishToUser(clerkUserId, "status_update" as any, { isPaused });

  // 🔔 Only notify if it changed
  if (prevPaused !== isPaused) {
    await notify(
      {
        type: "strategy_status",
        userId: clerkUserId,
        ts: new Date().toISOString(),
        isPaused: next.isPaused,
        isKillSwitched: false, // pause route doesn’t change this; keep explicit
      } as any,
      { prisma }
    );
  }

  return Response.json({
    ok: true,
    isPaused: next.isPaused,
  });
}
