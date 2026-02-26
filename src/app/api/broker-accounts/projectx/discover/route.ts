// src/app/api/broker-accounts/projectx/discover/route.ts
import { auth } from "@clerk/nextjs/server";

function toStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

type LoginKeyResponse = {
  token?: string;
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

type PXAccount = {
  id: number;
  name: string;
  balance: number;
  canTrade: boolean;
  isVisible: boolean;
  simulated: boolean;
};

type AccountSearchResponse = {
  accounts?: PXAccount[];
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const userName = toStr(body.username);
  const apiKey = toStr(body.apiKey);

  if (!userName || !apiKey) {
    return Response.json(
      { ok: false, error: "username and apiKey are required" },
      { status: 400 }
    );
  }

  // 1) loginKey -> token
  const loginRes = await fetch("https://api.topstepx.com/api/Auth/loginKey", {
    method: "POST",
    headers: { accept: "text/plain", "Content-Type": "application/json" },
    body: JSON.stringify({ userName, apiKey }),
  });

  const loginText = await loginRes.text();
  let loginJson: LoginKeyResponse | null = null;
  try {
    loginJson = loginText ? (JSON.parse(loginText) as LoginKeyResponse) : null;
  } catch {
    loginJson = null;
  }

  const token = loginJson?.token ?? null;
  if (!loginRes.ok || !token) {
    return Response.json(
      {
        ok: false,
        error: loginJson?.errorMessage || `ProjectX login failed (HTTP ${loginRes.status})`,
        errorCode: loginJson?.errorCode ?? null,
      },
      { status: 400 }
    );
  }

  // 2) account search
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
  let acctJson: AccountSearchResponse | null = null;
  try {
    acctJson = acctText ? (JSON.parse(acctText) as AccountSearchResponse) : null;
  } catch {
    acctJson = null;
  }

  if (!acctRes.ok) {
    return Response.json(
      {
        ok: false,
        error: acctJson?.errorMessage || `ProjectX account search failed (HTTP ${acctRes.status})`,
        errorCode: acctJson?.errorCode ?? null,
      },
      { status: 400 }
    );
  }

  // IMPORTANT: Match the UI’s expected keys:
  // - accountLabel (NOT accountName)
  // - balanceUsd (NOT balance)
  const accounts = (acctJson?.accounts ?? [])
    .filter((a) => a && typeof a.id === "number")
    .map((a) => ({
      externalId: String(a.id),
      accountLabel: String(a.name || "").trim(),
      balanceUsd: Number(a.balance ?? 0),
      canTrade: Boolean(a.canTrade),
      simulated: Boolean(a.simulated),
      isVisible: Boolean(a.isVisible),
    }))
    .filter((a) => a.externalId && a.accountLabel);

  // Sort: visible + canTrade first, then highest balance
  accounts.sort((a, b) => {
    const aScore = (a.isVisible ? 2 : 0) + (a.canTrade ? 1 : 0);
    const bScore = (b.isVisible ? 2 : 0) + (b.canTrade ? 1 : 0);
    if (bScore !== aScore) return bScore - aScore;
    return (b.balanceUsd ?? 0) - (a.balanceUsd ?? 0);
  });

  return Response.json({ ok: true, accounts });
}
