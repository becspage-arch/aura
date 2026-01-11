export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { getDashboardInitialData } from "@/lib/dashboard/server";
import { DashboardProvider } from "@/components/dashboard/DashboardStore";
import DashboardView from "@/components/dashboard/DashboardView";

export default async function AppHome() {
  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses?.[0]?.emailAddress ?? null;
  const displayName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user.username ?? null;

  await ensureUserProfile({
    clerkUserId: user.id,
    email,
    displayName,
  });

  let initialDb;
    try {
      initialDb = await getDashboardInitialData(user.id);
    } catch (e) {
      return (
        <main style={{ padding: 24 }}>
          <h1>Welcome to Aura</h1>
          <p>Could not load dashboard data.</p>
          <pre style={{ fontSize: 12 }}>{e instanceof Error ? e.message : "Unknown error"}</pre>
        </main>
      );
    }

  const initial = {
    accounts: profile.brokerAccounts.map((a) => ({
      id: a.id,
      brokerName: a.brokerName,
      accountLabel: a.accountLabel ?? null,
      externalId: a.externalId ?? null,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      brokerAccountId: o.brokerAccountId,
      externalId: o.externalId ?? null,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      status: o.status,
      qty: o.qty.toString(),
      price: o.price?.toString() ?? null,
      stopPrice: o.stopPrice?.toString() ?? null,
      filledQty: o.filledQty.toString(),
      avgFillPrice: o.avgFillPrice?.toString() ?? null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
    fills: fills.map((f) => ({
      id: f.id,
      brokerAccountId: f.brokerAccountId,
      orderId: f.orderId ?? null,
      externalId: f.externalId ?? null,
      symbol: f.symbol,
      side: f.side,
      qty: f.qty.toString(),
      price: f.price.toString(),
      createdAt: f.createdAt.toISOString(),
    })),
    events: events.map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      type: e.type,
      level: e.level,
      message: e.message,
      data: e.data ?? null,
      brokerAccountId: e.brokerAccountId ?? null,
      orderId: e.orderId ?? null,
    })),
    tradingState: {
      isPaused: profile.userState?.isPaused ?? false,
      isKillSwitched: profile.userState?.isKillSwitched ?? false,
      killSwitchedAt: profile.userState?.killSwitchedAt?.toISOString() ?? null,
      selectedBrokerAccountId: profile.userState?.selectedBrokerAccountId ?? null,
      selectedSymbol: profile.userState?.selectedSymbol ?? null,
    },
  };

  return (
    <DashboardProvider initial={initial}>
      <DashboardView clerkUserId={user.id} />
    </DashboardProvider>
  );
}
