import { db } from "@/src/lib/db"; // adjust import if your path differs

export async function ensureUserProfile(params: {
  clerkUserId: string;
  email?: string | null;
  displayName?: string | null;
}) {
  const { clerkUserId, email, displayName } = params;

  return db.userProfile.upsert({
    where: { clerkUserId },
    update: {
      email: email ?? undefined,
      displayName: displayName ?? undefined,
    },
    create: {
      clerkUserId,
      email: email ?? undefined,
      displayName: displayName ?? undefined,
    },
  });
}
