export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { getDashboardInitialData } from "@/lib/dashboard/server";
import { DashboardProvider } from "@/components/dashboard/DashboardStore";
import DashboardView from "@/components/dashboard/DashboardView";

export default async function LiveControlPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6">
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Live Control</h1>
          <p style={{ marginTop: 6, color: "var(--muted-foreground)" }}>
            Sign in to view live controls and monitoring.
          </p>
        </div>

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "var(--card)",
            color: "var(--card-foreground)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Not signed in</div>
          <div style={{ color: "var(--muted-foreground)" }}>
            Please sign in to access Live Control.
          </div>
        </section>
      </div>
    );
  }

  const email = user.emailAddresses?.[0]?.emailAddress ?? null;
  const displayName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user.username ?? null;

  // Ensure profile exists (keeps app consistent)
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
      <div className="mx-auto grid max-w-6xl gap-6">
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Live Control</h1>
          <p style={{ marginTop: 6, color: "var(--muted-foreground)" }}>
            Could not load dashboard data.
          </p>
        </div>

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "var(--card)",
            color: "var(--card-foreground)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Load error</div>
          <pre
            style={{
              margin: 0,
              marginTop: 10,
              overflow: "auto",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--muted)",
              padding: 12,
              fontSize: 12,
              color: "var(--muted-foreground)",
              whiteSpace: "pre-wrap",
            }}
          >
            {e instanceof Error ? e.message : "Unknown error"}
          </pre>
        </section>
      </div>
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
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Live Control</h1>
        <p style={{ marginTop: 6, color: "var(--muted-foreground)" }}>
          This is where users pause, kill-switch, select account, and manage live running.
          (UI only for now - we’ll wire it later.)
        </p>
      </div>

      {/* Placeholder card stays at the top so we remember what to build */}
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          background: "var(--card)",
          color: "var(--card-foreground)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Coming soon</div>
        <div style={{ color: "var(--muted-foreground)" }}>
          Controls, account selector, symbol selector, safety confirmations.
        </div>
      </section>

      {/* Park the current “old dashboard” here so nothing is lost */}
      <DashboardProvider initial={initial as any}>
        <DashboardView clerkUserId={user.id} />
      </DashboardProvider>
    </div>
  );
}
