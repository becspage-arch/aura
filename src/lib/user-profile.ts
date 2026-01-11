import { db } from "@/lib/db";

export async function ensureUserProfile(params: {
  clerkUserId: string;
  email?: string | null;
  displayName?: string | null;
}) {
  const { clerkUserId, email, displayName } = params;

  return prisma.userProfile.upsert({
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
