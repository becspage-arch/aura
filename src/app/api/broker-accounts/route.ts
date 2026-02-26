// src/app/api/broker-accounts/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";
import { encryptJson } from "@/lib/crypto";

type BrokerName = "projectx";

function toStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function toBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const accounts = await db.brokerAccount.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      brokerName: true,
      isEnabled: true,
      accountLabel: true,
      externalId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ ok: true, accounts });
}

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({} as any));

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const brokerName = (toStr(body.brokerName) || "projectx") as BrokerName;
  if (brokerName !== "projectx") {
    return Response.json({ ok: false, error: "unsupported broker" }, { status: 400 });
  }

  // Credentials (required)
  const username = toStr(body.username);
  const apiKey = toStr(body.apiKey);
  const contractId = toStr(body.contractId) || "CON.F.US.MGC.J26";

  // Account selection (required now)
  const externalId = toStr(body.externalId);        // ProjectX account id as string
  const accountLabel = toStr(body.accountLabel);    // ProjectX account display name

  // Enable/disable trading for THIS account
  const enable = toBool(body.enable, true);

  if (!username || !apiKey) {
    return Response.json({ ok: false, error: "username and apiKey are required" }, { status: 400 });
  }
  if (!externalId) {
    return Response.json({ ok: false, error: "externalId is required" }, { status: 400 });
  }
  if (!accountLabel) {
    return Response.json({ ok: false, error: "accountLabel is required" }, { status: 400 });
  }

  const encryptedPayload = encryptJson({
    username,
    apiKey,
    contractId,
    externalAccountId: externalId,
  });

  // Upsert per (userId + brokerName + externalId)
  const existing = await db.brokerAccount.findFirst({
    where: { userId: user.id, brokerName, externalId },
    select: { id: true },
  });

  const acct = existing
    ? await db.brokerAccount.update({
        where: { id: existing.id },
        data: {
          encryptedCredentials: encryptedPayload,
          isEnabled: enable,
          externalId,
          accountLabel,
        },
        select: { id: true, brokerName: true, isEnabled: true, externalId: true, accountLabel: true },
      })
    : await db.brokerAccount.create({
        data: {
          userId: user.id,
          brokerName,
          encryptedCredentials: encryptedPayload,
          isEnabled: enable,
          externalId,
          accountLabel,
        },
        select: { id: true, brokerName: true, isEnabled: true, externalId: true, accountLabel: true },
      });

  // If enabling, make it selected (keeps existing v1 behaviour)
  if (enable) {
    await db.userTradingState.upsert({
      where: { userId: user.id },
      update: { selectedBrokerAccountId: acct.id },
      create: { userId: user.id, selectedBrokerAccountId: acct.id },
      select: { id: true },
    });
  }

  return Response.json({ ok: true, account: acct });
}
