// src/app/api/activity/export/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { fetchActivity, toCsv, type SystemPreset } from "../_lib/activity";

export const dynamic = "force-dynamic";

function parseBool(v: string | null, defaultValue: boolean) {
  if (v == null) return defaultValue;
  const s = String(v).toLowerCase().trim();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return defaultValue;
}

export async function GET(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);

  const q = (url.searchParams.get("q") || "").trim() || null;

  // checkboxes (defaults match your UI)
  const includeMyActivity = parseBool(url.searchParams.get("my"), true);
  const includeTradeDecisions = parseBool(url.searchParams.get("decisions"), true);
  const includeAccountSystem = parseBool(url.searchParams.get("system"), false);

  // date range (ISO strings). Your UI should send these when not using presets.
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // Only meaningful if includeAccountSystem === true
  const systemPreset = (url.searchParams.get("systemPreset") || "important") as SystemPreset;
  const safePreset: SystemPreset =
    systemPreset === "all"
      ? "all"
      : systemPreset === "errors"
        ? "errors"
        : systemPreset === "settings"
          ? "settings"
          : "important";

  const profile = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  // Export a larger batch. Keep a sane cap.
  const { items } = await fetchActivity({
    userId: profile.id,
    q,
    limit: 1000,
    cursor: null,

    includeMyActivity,
    includeTradeDecisions,
    includeAccountSystem,

    systemPreset: safePreset,
    from,
    to,
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
