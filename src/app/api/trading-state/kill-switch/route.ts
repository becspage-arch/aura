// src/app/api/trading-state/kill-switch/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";
import { publishToUser } from "@/lib/ably/server";
import { writeAuditLog, writeEventLog } from "@/lib/logging/server";

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { isKillSwitched?: unknown };
  const isKillSwitched = Boolean(body?.isKillSwitched);

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const state = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const brokerAccountId = state.selectedBrokerAccountId;
  if (!brokerAccountId) {
    return new Response("No broker account selected", { status: 400 });
  }

  const nextAcc = await db.brokerAccount.update({
    where: { id: brokerAccountId },
    data: {
      isKillSwitched,
      killSwitchedAt: isKillSwitched ? new Date() : null,
    },
    select: { id: true, isKillSwitched: true, killSwitchedAt: true },
  });

  await writeAuditLog(user.id, "KILL_SWITCH_TOGGLED", {
    brokerAccountId,
    isKillSwitched,
  });

  await writeEventLog({
    type: "control_changed",
    level: "warn",
    message: `Kill switch set to ${isKillSwitched}`,
    data: { brokerAccountId, isKillSwitched },
    userId: user.id,
  });

  await publishToUser(clerkUserId, "status_update", {
    brokerAccountId,
    isKillSwitched: nextAcc.isKillSwitched,
  });

  return Response.json({
    ok: true,
    brokerAccountId,
    isKillSwitched: nextAcc.isKillSwitched,
    killSwitchedAt: nextAcc.killSwitchedAt?.toISOString?.() ?? null,
  });
}
