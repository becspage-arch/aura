// src/app/api/broker-accounts/[id]/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

function toBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as any));

  const enable = toBool(body.isEnabled, true);

  const acct = await db.brokerAccount.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!acct) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const updated = await db.brokerAccount.update({
    where: { id },
    data: { isEnabled: enable },
    select: { id: true, brokerName: true, isEnabled: true },
  });

  // If enabling, make it selected (simple v1 behaviour)
  if (enable) {
    await db.userTradingState.upsert({
      where: { userId: user.id },
      update: { selectedBrokerAccountId: updated.id },
      create: { userId: user.id, selectedBrokerAccountId: updated.id },
      select: { id: true },
    });
  }

  return Response.json({ ok: true, account: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const { id } = await ctx.params;

  const acct = await db.brokerAccount.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!acct) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  await db.brokerAccount.delete({ where: { id } });

  // If this was selected, clear selection
  const state = await db.userTradingState.findUnique({
    where: { userId: user.id },
    select: { selectedBrokerAccountId: true },
  });

  if (state?.selectedBrokerAccountId === id) {
    await db.userTradingState.update({
      where: { userId: user.id },
      data: { selectedBrokerAccountId: null },
    });
  }

  return Response.json({ ok: true });
}
