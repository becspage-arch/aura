// src/app/app/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { getDashboardInitialData } from "@/lib/dashboard/server";
import { DashboardProvider } from "@/components/dashboard/DashboardStore";
import DashboardView from "@/components/dashboard/DashboardView";

function ShellHeader({ right }: { right: React.ReactNode }) {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between rounded-xl px-4 py-3 aura-card">
      <Link href="/" className="text-sm font-medium aura-link">
        Aura
      </Link>
      <nav className="flex items-center gap-3 text-sm">{right}</nav>
    </header>
  );
}

export default async function AppHome() {
  const user = await currentUser();

  if (!user) {
    return (
      <main className="min-h-screen p-6">
        <ShellHeader
          right={
            <>
              <Link href="/sign-in" className="aura-link aura-muted hover:underline">
                Sign in
              </Link>
              <Link href="/sign-up" className="aura-link aura-muted hover:underline">
                Sign up
              </Link>
            </>
          }
        />

        <div className="mx-auto mt-10 max-w-5xl">
          <h1 className="text-2xl font-semibold">Welcome to Aura</h1>
          <p className="mt-2 aura-muted">Please sign in to view your dashboard.</p>
        </div>
      </main>
    );
  }

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

  let initialDb: any;
  try {
    initialDb = await getDashboardInitialData(user.id);
  } catch (e) {
    return (
      <main className="min-h-screen p-6">
        <ShellHeader
          right={
            <>
              <Link href="/app" className="aura-link aura-muted hover:underline">
                Dashboard
              </Link>
              <Link href="/app/activity" className="aura-link aura-muted hover:underline">
                Activity
              </Link>
              <Link href="/sign-out" className="aura-link aura-muted hover:underline">
                Sign out
              </Link>
            </>
          }
        />

        <div className="mx-auto mt-10 max-w-5xl">
          <h1 className="text-2xl font-semibold">Welcome to Aura</h1>
          <p className="mt-2 aura-muted">Could not load dashboard data.</p>

          <pre className="mt-4 overflow-auto rounded-lg p-4 text-xs aura-card">
            {e instanceof Error ? e.message : "Unknown error"}
          </pre>
        </div>
      </main>
    );
  }

  const accounts = (initialDb?.accounts ?? initialDb?.brokerAccounts ?? []) as any[];
  const orders = (initialDb?.orders ?? []) as any[];
  const fills = (initialDb?.fills ?? []) as any[];
  const events = (initialDb?.events ?? initialDb?.eventLog ?? []) as any[];
  const tradingStateDb = initialDb?.tradingState ?? initialDb?.userState ?? null;

  const initial = {
    accounts: accounts.map((a) => ({
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
      qty: typeof o.qty === "string" ? o.qty : o.qty?.toString?.() ?? String(o.qty),
      price: o.price == null ? null : typeof o.price === "string" ? o.price : o.price?.toString?.(),
      stopPrice:
        o.stopPrice == null ? null : typeof o.stopPrice === "string" ? o.stopPrice : o.stopPrice?.toString?.(),
      filledQty: typeof o.filledQty === "string" ? o.filledQty : o.filledQty?.toString?.() ?? "0",
      avgFillPrice:
        o.avgFillPrice == null
          ? null
          : typeof o.avgFillPrice === "string"
            ? o.avgFillPrice
            : o.avgFillPrice?.toString?.(),
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
      updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : String(o.updatedAt),
    })),
    fills: fills.map((f) => ({
      id: f.id,
      brokerAccountId: f.brokerAccountId,
      orderId: f.orderId ?? null,
      externalId: f.externalId ?? null,
      symbol: f.symbol,
      side: f.side,
      qty: typeof f.qty === "string" ? f.qty : f.qty?.toString?.() ?? String(f.qty),
      price: typeof f.price === "string" ? f.price : f.price?.toString?.() ?? String(f.price),
      createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
    })),
    events: events.map((ev) => ({
      id: ev.id,
      createdAt: ev.createdAt instanceof Date ? ev.createdAt.toISOString() : String(ev.createdAt),
      type: ev.type,
      level: ev.level,
      message: ev.message,
      data: ev.data ?? null,
      brokerAccountId: ev.brokerAccountId ?? null,
      orderId: ev.orderId ?? null,
    })),
    tradingState: {
      isPaused: tradingStateDb?.isPaused ?? false,
      isKillSwitched: tradingStateDb?.isKillSwitched ?? false,
      killSwitchedAt:
        tradingStateDb?.killSwitchedAt instanceof Date
          ? tradingStateDb.killSwitchedAt.toISOString()
          : tradingStateDb?.killSwitchedAt ?? null,
      selectedBrokerAccountId: tradingStateDb?.selectedBrokerAccountId ?? null,
      selectedSymbol: tradingStateDb?.selectedSymbol ?? null,
    },
    summary: null,
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 pb-10">
        <DashboardView clerkUserId={user.id} />
      </div>
    </div>
  );
}
