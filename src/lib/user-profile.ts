import { prisma } from "@/lib/prisma";

export async function ensureUserProfile(input: {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
}) {
  const { clerkUserId, email, displayName } = input;

  const existing = await prisma.userProfile.findUnique({
    where: { clerkUserId },
  });

  if (existing) {
    // optional: keep details up to date
    if (existing.email !== email || existing.displayName !== displayName) {
      return prisma.userProfile.update({
        where: { clerkUserId },
        data: { email, displayName },
      });
    }
    return existing;
  }

  return prisma.userProfile.create({
    data: { clerkUserId, email, displayName },
  });
}
