// src/app/api/native/google/exchange/route.ts
import { NextResponse } from "next/server";

type Body = { idToken: string };

async function verifyGoogleIdToken(idToken: string) {
  // Deterministic verification via Google tokeninfo endpoint
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    { cache: "no-store" }
  );

  if (!res.ok) return null;
  return (await res.json()) as {
    email?: string;
    email_verified?: string;
    sub?: string;
    aud?: string;
  };
}

async function clerkFetch(path: string, init?: RequestInit) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("Missing CLERK_SECRET_KEY");

  const res = await fetch(`https://api.clerk.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    return { ok: false as const, status: res.status, json };
  }

  return { ok: true as const, status: res.status, json };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const idToken = (body.idToken || "").trim();
  if (!idToken) {
    return NextResponse.json({ ok: false, error: "MISSING_ID_TOKEN" }, { status: 400 });
  }

  const claims = await verifyGoogleIdToken(idToken);
  if (!claims?.email || claims.email_verified !== "true") {
    return NextResponse.json({ ok: false, error: "INVALID_GOOGLE_TOKEN" }, { status: 401 });
  }

  const email = claims.email.toLowerCase();

  // 1) Find Clerk user by email
  const list = await clerkFetch(`/v1/users?email_address=${encodeURIComponent(email)}`);
  if (!list.ok) {
    return NextResponse.json(
      { ok: false, error: "CLERK_LIST_USERS_FAILED", detail: list.json },
      { status: 500 }
    );
  }

  let userId: string | null = (list.json?.data?.[0]?.id as string | undefined) ?? null;

  // 2) Create user if missing
  if (!userId) {
    const created = await clerkFetch(`/v1/users`, {
      method: "POST",
      body: JSON.stringify({
        email_address: [email],
      }),
    });

    if (!created.ok) {
      return NextResponse.json(
        { ok: false, error: "CLERK_CREATE_USER_FAILED", detail: created.json },
        { status: 500 }
      );
    }

    userId = created.json?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json({ ok: false, error: "NO_USER_ID" }, { status: 500 });
  }

  // 3) Create Clerk sign-in token (ticket)
  const token = await clerkFetch(`/v1/sign_in_tokens`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });

  if (!token.ok) {
    return NextResponse.json(
      { ok: false, error: "CLERK_CREATE_TOKEN_FAILED", detail: token.json },
      { status: 500 }
    );
  }

  const ticket = token.json?.token as string | undefined;
  if (!ticket) {
    return NextResponse.json({ ok: false, error: "NO_TICKET" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticket });
}