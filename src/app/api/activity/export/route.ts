// src/app/api/activity/export/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { fetchActivity, toCsv, type ActivityScope } from "../_lib/activity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);

  const scope = (url.searchParams.get("scope") || "user") as ActivityScope;
  const q = (url.searchParams.get("q") || "").trim() || null;

  const profile = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const safeScope: ActivityScope =
    scope === "all" ? "all" : scope === "user+aura" ? "user+aura" : "user";

  // Export a larger batch. Keep a sane cap.
  const { items } = await fetchActivity({
    userId: profile.id,
    scope: safeScope,
    q,
    limit: 1000,
    cursor: null,
  });

  const csv = toCsv(items);

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const filename = `aura-activity-${yyyy}-${mm}-${dd}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
