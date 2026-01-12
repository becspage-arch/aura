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

  // ✅ Ensure profile exists (create if missing)
  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const next = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {
      isKillSwitched,
      killSwitchedAt: isKillSwitched ? new Date() : null,
    },
    create: {
      userId: user.id,
      isKillSwitched,
      killSwitchedAt: isKillSwitched ? new Date() : null,
    },
  });

  await writeAuditLog(user.id, "KILL_SWITCH_TOGGLED", { isKillSwitched });

  await writeEventLog({
    type: "control_changed",
    level: "warn",
    message: `Kill switch set to ${isKillSwitched}`,
    data: { isKillSwitched },
    userId: user.id,
  });

  await publishToUser(clerkUserId, "status_update", { isKillSwitched });

  return Response.json({
    ok: true,
    isKillSwitched: next.isKillSwitched,
    killSwitchedAt: next.killSwitchedAt?.toISOString() ?? null,
  });
}
