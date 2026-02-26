// src/app/api/broker-accounts/bulk-enable/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { isEnabled?: unknown };
  const isEnabled = Boolean(body?.isEnabled);

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  await db.brokerAccount.updateMany({
    where: { userId: user.id },
    data: { isEnabled },
  });

  return Response.json({ ok: true, isEnabled });
}