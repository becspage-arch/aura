// src/app/api/activity/export/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { fetchActivity, toCsv, type SystemPreset } from "../_lib/activity";

export const dynamic = "force-dynamic";

function parseBool(v: string | null, fallback: boolean) {
  if (v == null) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function parseDateIso(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function GET(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);

  const q = (url.searchParams.get("q") || "").trim() || null;

  const includeMyActivity = parseBool(url.searchParams.get("my"), true);
  const includeTradeDecisions = parseBool(url.searchParams.get("decisions"), true);
  const includeAccountSystem = parseBool(url.searchParams.get("system"), false);

  const systemPreset = (url.searchParams.get("systemPreset") || "important") as SystemPreset;

  const from = parseDateIso(url.searchParams.get("from"));
  const to = parseDateIso(url.searchParams.get("to"));

  const profile = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const { items } = await fetchActivity({
    userId: profile.id,

    includeMyActivity,
    includeTradeDecisions,
    includeAccountSystem,

    systemPreset,

    from,
    to,

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
