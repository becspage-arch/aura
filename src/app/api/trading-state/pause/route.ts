import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";
import { publishToUser } from "@/lib/ably/server";
import { writeAuditLog, writeEventLog } from "@/lib/logging/server";

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const isPaused = Boolean(body?.isPaused);

  // ✅ Ensure profile exists (create if missing)
  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

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

  return Response.json({
    ok: true,
    isPaused: next.isPaused,
  });
}
