import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { publishToUser } from "@/lib/ably/server";
import { writeAuditLog, writeEventLog } from "@/lib/logging/server";

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  // Parse body safely
  const body = (await req.json().catch(() => ({}))) as { isKillSwitched?: unknown };

  // IMPORTANT: this must match your Prisma schema field name: isKillSwitched
  const isKillSwitched = Boolean(body?.isKillSwitched);

  const user = await db.userProfile.findUnique({ where: { clerkUserId } });
  if (!user) return new Response("UserProfile not found", { status: 404 });

  const next = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {
      isKillSwitched: isKillSwitched,
      killSwitchedAt: isKillSwitched ? new Date() : null,
    },
    create: {
      userId: user.id,
      isKillSwitched: isKillSwitched,
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
