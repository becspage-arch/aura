// src/app/api/activity/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { fetchActivity, type ActivityScope } from "./_lib/activity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);

  const scope = (url.searchParams.get("scope") || "user") as ActivityScope;
  const q = (url.searchParams.get("q") || "").trim() || null;
  const limit = Number(url.searchParams.get("limit") || 35);
  const cursor = url.searchParams.get("cursor");

  const profile = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const safeScope: ActivityScope =
    scope === "all" ? "all" : scope === "user+aura" ? "user+aura" : "user";

  const { items, nextCursor } = await fetchActivity({
    userId: profile.id,
    scope: safeScope,
    q,
    limit,
    cursor,
  });

  return NextResponse.json({ ok: true, items, nextCursor });
}
