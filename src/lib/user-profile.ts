// src/lib/user-profile.ts
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";

function deriveDisplayNameFromClerk(u: any) {
  const full =
    [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || null;

  if (full) return full;

  const username = (u?.username || "").trim();
  if (username) return username;

  // fall back to email local part if available
  const email = u?.primaryEmailAddress?.emailAddress || null;
  if (email && typeof email === "string") {
    const local = email.split("@")[0]?.trim();
    return local || null;
  }

  return null;
}

async function fetchFromClerk(clerkUserId: string): Promise<{
  email: string | null;
  displayName: string | null;
}> {
  try {
    const client = await clerkClient();
    const u = await client.users.getUser(clerkUserId);

    const email =
      (u as any)?.primaryEmailAddress?.emailAddress ??
      (Array.isArray((u as any)?.emailAddresses) && (u as any).emailAddresses[0]?.emailAddress) ??
      null;

    const displayName = deriveDisplayNameFromClerk(u);

    return {
      email: typeof email === "string" && email.trim() ? email.trim() : null,
      displayName,
    };
  } catch (err) {
    // Never break sign-in / page loads because Clerk lookup failed
    console.error("ENSURE_USERPROFILE_CLERK_LOOKUP_FAILED", { clerkUserId, err });
    return { email: null, displayName: null };
  }
}

export async function ensureUserProfile(input: {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
}) {
  const { clerkUserId } = input;

  // 1) Best-effort derive details:
  // - If caller provides non-null values, prefer them
  // - Otherwise, pull from Clerk
  let email = input.email;
  let displayName = input.displayName;

  if (!email || !displayName) {
    const fromClerk = await fetchFromClerk(clerkUserId);
    if (!email) email = fromClerk.email;
    if (!displayName) displayName = fromClerk.displayName;
  }

  const existing = await prisma.userProfile.findUnique({
    where: { clerkUserId },
  });

  if (existing) {
    // 2) IMPORTANT: never overwrite with null
    const data: { email?: string; displayName?: string } = {};

    if (email && email !== existing.email) data.email = email;
    if (displayName && displayName !== existing.displayName) data.displayName = displayName;

    if (Object.keys(data).length > 0) {
      return prisma.userProfile.update({
        where: { clerkUserId },
        data,
      });
    }

    return existing;
  }

  // 3) Create with whatever we have (may still be null, but we tried)
  return prisma.userProfile.create({
    data: {
      clerkUserId,
      email,
      displayName,
    },
  });
}
