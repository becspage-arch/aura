// src/app/api/broker-accounts/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";
import { decryptJson, encryptJson } from "@/lib/crypto";

type BrokerName = "projectx";

function toStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

async function loginAndFetchAccounts(username: string, apiKey: string) {
  // 1) Login
  const loginRes = await fetch("https://api.topstepx.com/api/Auth/loginKey", {
    method: "POST",
    headers: { accept: "text/plain", "Content-Type": "application/json" },
    body: JSON.stringify({ userName: username, apiKey }),
  });

  const loginText = await loginRes.text();
  const loginJson = loginText ? JSON.parse(loginText) : null;
  const token = loginJson?.token;

  if (!loginRes.ok || !token) {
    throw new Error(loginJson?.errorMessage || "ProjectX login failed");
  }

  // 2) Fetch accounts
  const acctRes = await fetch("https://api.topstepx.com/api/Account/search", {
    method: "POST",
    headers: {
      accept: "text/plain",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ onlyActiveAccounts: true }),
  });

  const acctText = await acctRes.text();
  const acctJson = acctText ? JSON.parse(acctText) : null;

  if (!acctRes.ok) {
    throw new Error(acctJson?.errorMessage || "ProjectX account search failed");
  }

  return (acctJson?.accounts ?? []).map((a: any) => ({
    externalId: String(a.id),
    accountLabel: String(a.name || ""),
    balanceUsd: Number(a.balance ?? 0),
  }));
}

async function loginAndFetchAccountBalancesFromEncrypted(encryptedCredentials: any) {
  const creds = decryptJson(encryptedCredentials);
  const username = String(creds?.username || "").trim();
  const apiKey = String(creds?.apiKey || "").trim();

  if (!username || !apiKey) throw new Error("Missing broker credentials");

  const loginRes = await fetch("https://api.topstepx.com/api/Auth/loginKey", {
    method: "POST",
    headers: { accept: "text/plain", "Content-Type": "application/json" },
    body: JSON.stringify({ userName: username, apiKey }),
  });

  const loginText = await loginRes.text();
  const loginJson = loginText ? JSON.parse(loginText) : null;
  const token = loginJson?.token;

  if (!loginRes.ok || !token) {
    throw new Error(loginJson?.errorMessage || "ProjectX login failed");
  }

  const acctRes = await fetch("https://api.topstepx.com/api/Account/search", {
    method: "POST",
    headers: {
      accept: "text/plain",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ onlyActiveAccounts: true }),
  });

  const acctText = await acctRes.text();
  const acctJson = acctText ? JSON.parse(acctText) : null;

  if (!acctRes.ok) {
    throw new Error(acctJson?.errorMessage || "ProjectX account search failed");
  }

  const m = new Map<string, number>();
  for (const a of acctJson?.accounts ?? []) {
    const externalId = String(a?.id ?? "").trim();
    const bal = Number(a?.balance ?? 0);
    if (externalId) m.set(externalId, bal);
  }
  return m;
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
      encryptedCredentials: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Live balances (ProjectX only). Never fail the page if broker is down.
  let balanceByExternalId: Map<string, number> | null = null;

  try {
    const anyProjectX = accounts.find((a) => a.brokerName === "projectx" && a.encryptedCredentials);
    if (anyProjectX?.encryptedCredentials) {
      balanceByExternalId = await loginAndFetchAccountBalancesFromEncrypted(anyProjectX.encryptedCredentials);
    }
  } catch {
    balanceByExternalId = null;
  }

  const shaped = accounts.map((a) => {
    const externalId = (a.externalId ?? "").trim();
    const bal = balanceByExternalId?.get(externalId);

    return {
      id: a.id,
      brokerName: a.brokerName,
      isEnabled: a.isEnabled,
      accountLabel: a.accountLabel,
      externalId: a.externalId,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      balanceUsd: typeof bal === "number" && Number.isFinite(bal) ? bal : null,
    };
  });

  return Response.json({ ok: true, accounts: shaped });
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

  const username = toStr(body.username);
  const apiKey = toStr(body.apiKey);
  const symbol = toStr(body.symbol) || "MGC";

  if (!username || !apiKey) {
    return Response.json(
      { ok: false, error: "username and apiKey are required" },
      { status: 400 }
    );
  }

  // Discover accounts from ProjectX
  let discovered;
  try {
    discovered = await loginAndFetchAccounts(username, apiKey);
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || "ProjectX error" }, { status: 400 });
  }

  if (!discovered.length) {
    return Response.json({ ok: false, error: "No active accounts found" }, { status: 400 });
  }

  const encryptedPayload = encryptJson({
    username,
    apiKey,
    symbol,
  });

  // Upsert ALL discovered accounts
  for (const acct of discovered) {
    const existing = await db.brokerAccount.findFirst({
      where: {
        userId: user.id,
        brokerName,
        externalId: acct.externalId,
      },
      select: { id: true },
    });

    if (existing) {
      await db.brokerAccount.update({
        where: { id: existing.id },
        data: {
          encryptedCredentials: encryptedPayload,
          accountLabel: acct.accountLabel,
        },
      });
    } else {
      await db.brokerAccount.create({
        data: {
          userId: user.id,
          brokerName,
          encryptedCredentials: encryptedPayload,
          externalId: acct.externalId,
          accountLabel: acct.accountLabel,
          isEnabled: false, // start disabled by default
        },
      });
    }
  }

  const accounts = await db.brokerAccount.findMany({
    where: { userId: user.id, brokerName },
    select: {
      id: true,
      brokerName: true,
      isEnabled: true,
      accountLabel: true,
      externalId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ ok: true, accounts });
}
