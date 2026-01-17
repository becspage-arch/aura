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
      <main
        className="min-h-screen p-6"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <header
          className="mx-auto flex max-w-5xl items-center justify-between rounded-xl px-4 py-3"
          style={{
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--card-foreground)",
          }}
        >
          <Link href="/" className="text-sm font-medium">
            Aura
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/sign-in" className="hover:underline" style={{ color: "var(--muted-foreground)" }}>
              Sign in
            </Link>
            <Link href="/sign-up" className="hover:underline" style={{ color: "var(--muted-foreground)" }}>
              Sign up
            </Link>
          </nav>
        </header>

        <div className="mx-auto mt-10 max-w-5xl" style={{ color: "var(--muted-foreground)" }}>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            Welcome to Aura
          </h1>
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
      <main
        className="min-h-screen p-6"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <header
          className="mx-auto flex max-w-5xl items-center justify-between rounded-xl px-4 py-3"
          style={{
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--card-foreground)",
          }}
        >
          <Link href="/" className="text-sm font-medium">
            Aura
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/app" className="hover:underline" style={{ color: "var(--muted-foreground)" }}>
              Dashboard
            </Link>
            <Link href="/app/audit" className="hover:underline" style={{ color: "var(--muted-foreground)" }}>
              Audit
            </Link>
            <Link href="/sign-out" className="hover:underline" style={{ color: "var(--muted-foreground)" }}>
              Sign out
            </Link>
          </nav>
        </header>

        <div className="mx-auto mt-10 max-w-5xl">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            Welcome to Aura
          </h1>
          <p className="mt-2" style={{ color: "var(--muted-foreground)" }}>
            Could not load dashboard data.
          </p>
          <pre
            className="mt-4 overflow-auto rounded-lg p-4 text-xs"
            style={{
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--card-foreground)",
            }}
          >
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
    <div style={{ background: "var(--background)", color: "var(--foreground)", minHeight: "100vh" }}>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-semibold">
          Aura
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/app/profile"
            className="hidden hover:underline sm:inline"
            style={{ color: "var(--muted-foreground)" }}
          >
            {displayName ?? email ?? ""}
          </Link>

          <Link href="/sign-out" className="hover:underline" style={{ color: "var(--muted-foreground)" }}>
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
