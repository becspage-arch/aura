export const dynamic = "force-dynamic";

import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { getDashboardInitialData } from "@/lib/dashboard/server";
import { DashboardProvider } from "@/components/dashboard/DashboardStore";
import DashboardView from "@/components/dashboard/DashboardView";

export default async function AppHome() {
  const user = await currentUser();

  // If someone hits /app unauthenticated, give them a way out
  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-50 p-6 dark:bg-black">
        <header className="mx-auto flex max-w-5xl items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <Link href="/" className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Aura
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/sign-in" className="text-zinc-700 hover:underline dark:text-zinc-200">
              Sign in
            </Link>
            <Link href="/sign-up" className="text-zinc-700 hover:underline dark:text-zinc-200">
              Sign up
            </Link>
          </nav>
        </header>

        <div className="mx-auto mt-10 max-w-5xl text-zinc-700 dark:text-zinc-200">
          <h1 className="text-2xl font-semibold">Welcome to Aura</h1>
          <p className="mt-2">Please sign in to view your dashboard.</p>
        </div>
      </main>
    );
  }

  const email = user.emailAddresses?.[0]?.emailAddress ?? null;
  const displayName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user.username ?? null;

  // IMPORTANT: keep the returned profile so we have profile.id + any userState
  const profile = await ensureUserProfile({
    clerkUserId: user.id,
    email,
    displayName,
  });

  let initialDb: any;
  try {
    // If your getDashboardInitialData expects profile.id, this is correct.
    // If it expects clerkUserId, change profile.id -> user.id.
    initialDb = await getDashboardInitialData(user.id);
  } catch (e) {
    return (
      <main className="min-h-screen bg-zinc-50 p-6 dark:bg-black">
        <header className="mx-auto flex max-w-5xl items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <Link href="/" className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Aura
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/app" className="text-zinc-700 hover:underline dark:text-zinc-200">
              Dashboard
            </Link>
            <Link href="/app/audit" className="text-zinc-700 hover:underline dark:text-zinc-200">
              Audit
            </Link>
            <Link href="/sign-out" className="text-zinc-700 hover:underline dark:text-zinc-200">
              Sign out
            </Link>
          </nav>
        </header>

        <div className="mx-auto mt-10 max-w-5xl">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Welcome to Aura</h1>
          <p className="mt-2 text-zinc-700 dark:text-zinc-200">Could not load dashboard data.</p>
          <pre className="mt-4 overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {e instanceof Error ? e.message : "Unknown error"}
          </pre>
        </div>
      </main>
    );
  }

  // Be defensive about the shape so TS/build doesn't break
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
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Aura
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/app/profile"
            className="hidden text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50 sm:inline"
          >
            {displayName ?? email ?? ""}
          </Link>

          <Link href="/sign-out" className="text-zinc-700 hover:underline dark:text-zinc-200">
            Sign out
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 pb-10">
        <DashboardProvider initial={initial as any}>
          <DashboardView clerkUserId={user.id} />
        </DashboardProvider>
      </div>
    </div>
  );
}
