// src/app/api/trading-state/select-broker-account/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";
import { writeAuditLog, writeEventLog } from "@/lib/logging/server";
import { publishToUser } from "@/lib/ably/server";

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { brokerAccountId?: unknown };
  const brokerAccountId = String(body?.brokerAccountId || "").trim();
  if (!brokerAccountId) {
    return new Response("Missing brokerAccountId", { status: 400 });
  }

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  // Enforce ownership: user can only select THEIR broker account
  const acct = await db.brokerAccount.findFirst({
    where: { id: brokerAccountId, userId: user.id },
    select: { id: true, brokerName: true, externalId: true, isPaused: true, isKillSwitched: true },
  });

  if (!acct) {
    return new Response("Broker account not found", { status: 404 });
  }

  const next = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: { selectedBrokerAccountId: acct.id },
    create: { userId: user.id, selectedBrokerAccountId: acct.id },
    select: { id: true, selectedBrokerAccountId: true },
  });

  await writeAuditLog(user.id, "BROKER_ACCOUNT_SELECTED", {
    brokerAccountId: acct.id,
    brokerName: acct.brokerName,
    externalId: acct.externalId ?? null,
  });

  await writeEventLog({
    type: "control_changed",
    level: "info",
    message: "Selected broker account changed",
    data: { brokerAccountId: acct.id, brokerName: acct.brokerName, externalId: acct.externalId ?? null },
    userId: user.id,
    brokerAccountId: acct.id,
  });

  await publishToUser(clerkUserId, "status_update", {
    selectedBrokerAccountId: acct.id,
    isPaused: acct.isPaused,
    isKillSwitched: acct.isKillSwitched,
  } as any);

  return Response.json({ ok: true, ...next });
}
