// src/app/api/activity/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { fetchActivity, type SystemPreset } from "./_lib/activity";

export const dynamic = "force-dynamic";

function parseBool(v: string | null, fallback: boolean) {
  if (v == null) return fallback;
  const s = String(v).toLowerCase().trim();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return fallback;
}

function parseIsoOrNull(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);

  const q = (url.searchParams.get("q") || "").trim() || null;
  const limit = Number(url.searchParams.get("limit") || 35);
  const cursor = url.searchParams.get("cursor");

  // Checkbox filters
  const includeMyActivity = parseBool(url.searchParams.get("my"), true);
  const includeTradeDecisions = parseBool(url.searchParams.get("decisions"), true);
  const includeAccountSystem = parseBool(url.searchParams.get("system"), false);

  // System preset (only matters if includeAccountSystem === true)
  const systemPreset = (url.searchParams.get("systemPreset") || "important") as SystemPreset;

  // Time range (ISO strings)
  const from = parseIsoOrNull(url.searchParams.get("from"));
  const to = parseIsoOrNull(url.searchParams.get("to"));

  const profile = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const { items, nextCursor, summary } = await fetchActivity({
    userId: profile.id,

    includeMyActivity,
    includeTradeDecisions,
    includeAccountSystem,

    systemPreset,

    from,
    to,

    q,
    limit,
    cursor,
  });

  return NextResponse.json({ ok: true, items, nextCursor, summary });
}