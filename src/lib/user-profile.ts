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

  // 1) Best-effort derive details
  let email = input.email;
  let displayName = input.displayName;

  if (!email || !displayName) {
    const fromClerk = await fetchFromClerk(clerkUserId);
    if (!email) email = fromClerk.email;
    if (!displayName) displayName = fromClerk.displayName;
  }

  // Normalize email for consistent uniqueness
  const emailNorm =
    typeof email === "string" && email.trim()
      ? email.trim().toLowerCase()
      : null;

  const existingByClerk = await prisma.userProfile.findUnique({
    where: { clerkUserId },
  });

  if (existingByClerk) {
    // never overwrite with null
    const data: { email?: string; displayName?: string } = {};

    if (emailNorm && emailNorm !== (existingByClerk.email ?? null)) data.email = emailNorm;
    if (displayName && displayName !== existingByClerk.displayName) data.displayName = displayName;

    if (Object.keys(data).length > 0) {
      try {
        return await prisma.userProfile.update({
          where: { clerkUserId },
          data,
        });
      } catch (err: any) {
        // If updating email collides with another existing profile, do NOT crash the app.
        // Keep current email, still allow displayName update.
        if (err?.code === "P2002" && data.email) {
          const { email: _dropEmail, ...rest } = data;
          if (Object.keys(rest).length > 0) {
            return prisma.userProfile.update({
              where: { clerkUserId },
              data: rest,
            });
          }
          return existingByClerk;
        }
        throw err;
      }
    }

    return existingByClerk;
  }

  // 2) No profile for this clerkUserId yet.
  // If we have an email, see if an existing profile already owns it.
  if (emailNorm) {
    const existingByEmail = await prisma.userProfile.findUnique({
      where: { email: emailNorm },
    });

    if (existingByEmail) {
      // Attach this existing profile to the new clerk user id
      // (this is what fixes your crash)
      return prisma.userProfile.update({
        where: { id: existingByEmail.id },
        data: {
          clerkUserId,
          ...(displayName ? { displayName } : {}),
        },
      });
    }
  }

  // 3) Create new profile (email may be null)
  return prisma.userProfile.create({
    data: {
      clerkUserId,
      email: emailNorm,
      displayName,
    },
  });
}
