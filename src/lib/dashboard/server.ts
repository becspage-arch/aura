import { db } from "@/lib/db";

export async function getDashboardInitialData(clerkUserId: string) {
  // Clerk userId maps to UserProfile.clerkUserId (nullable in schema, but should exist for logged-in users)
  const user = await db.userProfile.findUnique({
    where: { clerkUserId },
    include: {
      brokerAccounts: { orderBy: { createdAt: "desc" } },
      userState: true,
    },
  });

  if (!user) throw new Error("UserProfile not found for clerkUserId");

  const orders = await db.order.findMany({
    where: { brokerAccountId: { in: user.brokerAccounts.map((a) => a.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const fills = await db.fill.findMany({
    where: { brokerAccountId: { in: user.brokerAccounts.map((a) => a.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const events = await db.eventLog.findMany({
    where: { brokerAccountId: { in: user.brokerAccounts.map((a) => a.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { user, orders, fills, events };
}
