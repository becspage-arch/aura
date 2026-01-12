import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

export async function getDashboardInitialData(clerkUserId: string) {
  // Ensure profile exists (create if missing)
  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  // Now fetch related data using the DB user.id
  const brokerAccounts = await db.brokerAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const accountIds = brokerAccounts.map((a) => a.id);

  const orders = await db.order.findMany({
    where: { brokerAccountId: { in: accountIds } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const fills = await db.fill.findMany({
    where: { brokerAccountId: { in: accountIds } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const events = await db.eventLog.findMany({
    where: { brokerAccountId: { in: accountIds } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const userState = await db.userTradingState.findUnique({
    where: { userId: user.id },
  });

  // Match the shape your dashboard expects
  return {
    user: { ...user, brokerAccounts, userState },
    orders,
    fills,
    events,
  };
}
