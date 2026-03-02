// src/app/api/trading-state/pause/route.ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureUserProfile } from "@/lib/user-profile";
import { publishToUser } from "@/lib/ably/server";
import { writeAuditLog, writeEventLog } from "@/lib/logging/server";
import { notify } from "@/lib/notifications/notify";

// Note: This endpoint is GLOBAL pause/run for the user (all enabled accounts).
// This keeps Strategy Setup consistent with /api/system/status and /api/trading-state/runtime.

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const accounts = await prisma.brokerAccount.findMany({
    where: { userId: user.id, isEnabled: true },
    select: { id: true, isPaused: true, isKillSwitched: true, killSwitchedAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (accounts.length === 0) {
    return Response.json({
      ok: true,
      brokerAccountId: null,
      isPaused: true,
      isKillSwitched: false,
      killSwitchedAt: null,
    });
  }

  // "Globally paused" means: no enabled account is in a runnable (unpaused + not kill-switched) state.
  const anyRunnableUnpaused = accounts.some((a) => !a.isPaused && !a.isKillSwitched);
  const anyKillSwitched = accounts.some((a) => a.isKillSwitched);

  const isPaused = !anyRunnableUnpaused;
  const isKillSwitched = isPaused && anyKillSwitched;

  const newestKillAt =
    accounts
      .map((a) => a.killSwitchedAt?.getTime?.() ?? null)
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => b - a)[0] ?? null;

  return Response.json({
    ok: true,
    brokerAccountId: null,
    isPaused,
    isKillSwitched,
    killSwitchedAt: newestKillAt ? new Date(newestKillAt).toISOString() : null,
  });
}

async function handleSetPause(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nextPaused = Boolean((body as any)?.isPaused);

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const enabledAccounts = await prisma.brokerAccount.findMany({
    where: { userId: user.id, isEnabled: true },
    select: { id: true, isPaused: true, isKillSwitched: true },
  });

  if (enabledAccounts.length === 0) {
    return new Response("No enabled broker accounts", { status: 400 });
  }

  const enabledIds = enabledAccounts.map((a) => a.id);

  // Only unpause accounts that are NOT kill-switched.
  const targetIds = nextPaused
    ? enabledIds
    : enabledAccounts.filter((a) => !a.isKillSwitched).map((a) => a.id);

  if (targetIds.length === 0) {
    // Everything is kill-switched, so "Run" can't do anything.
    return Response.json({
      ok: true,
      brokerAccountIds: enabledIds,
      isPaused: true,
      note: "All enabled accounts are kill-switched; cannot run until kill switch is disabled.",
    });
  }

  // Track whether anything actually changed (best-effort)
  const prevAnyRunnableUnpaused = enabledAccounts.some((a) => !a.isPaused && !a.isKillSwitched);

  await prisma.brokerAccount.updateMany({
    where: { id: { in: targetIds } },
    data: {
      isPaused: nextPaused,
      pausedAt: nextPaused ? new Date() : null,
    },
  });

  await writeAuditLog(user.id, "TRADING_PAUSE_TOGGLED", {
    brokerAccountIds: targetIds,
    isPaused: nextPaused,
    scope: "all_enabled_accounts",
  });

  await writeEventLog({
    type: "control_changed",
    level: "info",
    message: `Pause set to ${nextPaused} (all enabled accounts)`,
    data: { brokerAccountIds: targetIds, isPaused: nextPaused },
    userId: user.id,
    brokerAccountId: null,
  });

  // For UI: when nextPaused=true, definitely paused.
  // When nextPaused=false, "paused" is false only if at least one runnable account exists (non-kill).
  const nextAnyRunnableUnpaused = nextPaused ? false : targetIds.length > 0;
  const isPaused = !nextAnyRunnableUnpaused;

  await publishToUser(clerkUserId, "status_update", { isPaused });

  // Notify only if the high-level "running vs not" changed.
  const prevIsPaused = !prevAnyRunnableUnpaused;
  if (prevIsPaused !== isPaused) {
    try {
      await notify(
        {
          type: "strategy_status_changed",
          userId: clerkUserId,
          ts: new Date().toISOString(),
          isPaused,
        } as any,
        { prisma: prisma as any }
      );
    } catch (err) {
      console.error("STRATEGY_STATUS_NOTIFY_FAILED", err);
    }
  }

  return Response.json({
    ok: true,
    brokerAccountIds: targetIds,
    isPaused: nextPaused,
  });
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