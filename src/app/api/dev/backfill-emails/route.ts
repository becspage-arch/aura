// src/app/api/dev/backfill-emails/route.ts
import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

function deriveDisplayName(u: any) {
  const full = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;

  const username = (u?.username || "").trim();
  if (username) return username;

  const email = u?.primaryEmailAddress?.emailAddress || null;
  if (email && typeof email === "string") return email.split("@")[0]?.trim() || null;

  return null;
}

export async function POST(req: Request) {
  // simple shared-secret gate (set this in Vercel env)
  const token = req.headers.get("x-aura-token") || "";
  const expected = (process.env.BACKFILL_TOKEN || "").trim();

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Server missing BACKFILL_TOKEN" },
      { status: 500 }
    );
  }

  if (!token || token !== expected) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Only rows missing email AND that have a Clerk user id
  const users = await prisma.userProfile.findMany({
    where: {
      email: null,
      clerkUserId: { not: null },
    },
    select: {
      id: true,
      clerkUserId: true,
      email: true,
      displayName: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  const errors: Array<{ clerkUserId: string; error: string }> = [];

  // Create the Clerk client once (not on every loop)
  const client = await clerkClient();

  for (const p of users) {
    // ✅ Guard: TS + runtime safety
    if (!p.clerkUserId) {
      skipped++;
      continue;
    }

    try {
      const u = await client.users.getUser(p.clerkUserId);

      const email =
        (u as any)?.primaryEmailAddress?.emailAddress ??
        (Array.isArray((u as any)?.emailAddresses) &&
          (u as any).emailAddresses[0]?.emailAddress) ??
        null;

      const displayName = deriveDisplayName(u);

      const data: { email?: string; displayName?: string } = {};

      if (p.email == null && typeof email === "string" && email.trim()) {
        data.email = email.trim();
      }

      if (p.displayName == null && displayName) {
        data.displayName = displayName;
      }

      if (Object.keys(data).length === 0) {
        skipped++;
        continue;
      }

      await prisma.userProfile.update({
        where: { id: p.id },
        data,
      });

      updated++;
    } catch (err: any) {
      errors.push({
        clerkUserId: p.clerkUserId,
        error: err?.message ? String(err.message) : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    totalCandidates: users.length,
    updated,
    skipped,
    errors,
  });
}
