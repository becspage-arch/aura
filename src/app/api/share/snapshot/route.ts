// src/app/api/share/snapshot/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const payload = body?.payload ?? null;

  const id = crypto.randomUUID();
  const key = `snapshot:${id}`;

  await db.systemState.create({
    data: {
      key,
      value: {
        v: 1,
        id,
        createdAt: new Date().toISOString(),
        ownerClerkUserId: clerkUserId,
        payload,
      },
    },
    select: { id: true },
  });

  return Response.json({ ok: true, id });
}
