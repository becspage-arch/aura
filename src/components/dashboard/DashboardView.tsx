"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeUserChannel } from "@/lib/ably/client";
import { useDashboard } from "@/components/dashboard/DashboardStore";
import type { AuraRealtimeEvent } from "@/lib/realtime/events";

export default function DashboardView({ clerkUserId }: { clerkUserId?: string }) {
  const { state, dispatch } = useDashboard();

  const channelName = useMemo(() => (clerkUserId ? `user:${clerkUserId}` : null), [clerkUserId]);

  // Optional: filter by selected account (used later when we wire stats)
  const [selectedAccountId] = useState<string | null>(state.tradingState?.selectedBrokerAccountId ?? null);

  useEffect(() => {
    if (!channelName) return;

    const unsubscribe = subscribeUserChannel(channelName, ({ event }) => {
      const e = event as AuraRealtimeEvent;

      // Keep ingesting events so the dashboard can later show "recent activity" etc.
      dispatch({
        type: "ADD_EVENT",
        payload: {
          id: `${e.ts}:${e.type}`,
          createdAt: e.ts,
          type: e.type,
          level: e.type === "error" ? "error" : "info",
          message: e.type,
          data: e.data as any,
          brokerAccountId: (e.data as any)?.accountId ?? null,
          orderId: (e.data as any)?.orderId ?? null,
        },
      });
    });

    return () => unsubscribe();
  }, [channelName, dispatch]);

  const accounts = state.accounts ?? [];
  const events = state.events ?? [];

  // Prefer app-selected symbol if present
  const selectedSymbol = state.tradingState?.selectedSymbol ?? "MGC";

  // ---- Dashboard placeholder values (NO backend wiring yet) ----
  const placeholder = {
    totalProfit: "+£—",
    today: "+£—",
    month: "+£—",
    auraAllUsers: "£—", // business KPI, wired later
    statusStrategy: state.tradingState?.isPaused ? "Paused" : "Active",
    statusTrading: state.tradingState?.isKillSwitched ? "Stopped" : "Monitoring",
    broker: accounts?.[0]?.brokerName ? `Connected (${accounts[0].brokerName})` : "Connected",
    riskMode: "Normal",
    lastTrade: "—",
    winRate: "—%",
    profitFactor: "—",
    avgRR: "—R",
    maxDD: "—%",
  };

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Dashboard</h1>
        <p style={{ marginTop: 6, color: "var(--muted-foreground)" }}>
          Investor calm - trader precision. Profit-first overview.
        </p>
      </div>

      {/* SECTION 1: Profit at a glance */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <StatCard label="Total Profit" value={placeholder.totalProfit} sub="All time" emphasize />
        <StatCard label="Today" value={placeholder.today} sub="Since 00:00" />
        <StatCard label="This Month" value={placeholder.month} sub="Calendar month" />
        <StatCard label="Aura Profit (All Users)" value={placeholder.auraAllUsers} sub="Total generated" />
      </div>

      {/* SECTION 2: System status (read-only here) */}
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          background: "var(--card)",
          color: "var(--card-foreground)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontWeight: 700 }}>System status</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Symbol: <span style={{ color: "var(--card-foreground)" }}>{selectedSymbol}</span>
          </div>
        </div>

        <div className="grid gap-3" style={{ marginTop: 12, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <StatusRow label="Strategy" value={placeholder.statusStrategy} />
          <StatusRow label="Trading" value={placeholder.statusTrading} />
          <StatusRow label="Broker" value={placeholder.broker} />
          <StatusRow label="Account" value={selectedAccountId ? "Selected" : "All"} />
          <StatusRow label="Risk mode" value={placeholder.riskMode} />
          <StatusRow label="Last trade" value={placeholder.lastTrade} />
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted-foreground)" }}>
          Controls live in Live Control. Strategy rules live in Strategy.
        </div>
      </section>

      {/* SECTION 3: Cumulative P&L by day (wireframe placeholder) */}
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          background: "var(--card)",
          color: "var(--card-foreground)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Performance</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted-foreground)" }}>
              Cumulative P&amp;L (Daily)
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
            <Pill label="7D" active={false} />
            <Pill label="30D" active />
            <Pill label="All" active={false} />
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "var(--muted)",
            padding: 12,
            height: 220,
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
          }}
          aria-label="Cumulative P&L daily chart placeholder"
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                borderRadius: 10,
                background: "rgba(214,194,143,0.35)",
                height: 40 + i * 12,
                border: "1px solid rgba(214,194,143,0.25)",
              }}
              title="Placeholder bar"
            />
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted-foreground)" }}>
          <strong style={{ color: "var(--card-foreground)" }}>{placeholder.totalProfit}</strong> since start
        </div>
      </section>

      {/* SECTION 4: Performance ratios */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <MiniStat label="Win rate" value={placeholder.winRate} />
        <MiniStat label="Profit factor" value={placeholder.profitFactor} />
        <MiniStat label="Avg R:R" value={placeholder.avgRR} />
        <MiniStat label="Max drawdown" value={placeholder.maxDD} />
      </div>

      {/* SECTION 5: Recent trades (placeholder) */}
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          background: "var(--card)",
          color: "var(--card-foreground)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Recent trades</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Last 5</div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--muted)",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>—</span>
                <span style={{ fontWeight: 700 }}>MGC</span>
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>—</span>
              </div>
              <div style={{ fontWeight: 700, color: "var(--card-foreground)" }}>£—</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted-foreground)" }}>
          Full review lives in Trade Log.
        </div>
      </section>

      {/* SECTION 6: Quiet prompts */}
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          background: "var(--card)",
          color: "var(--card-foreground)",
        }}
      >
        <div style={{ fontWeight: 700 }}>Next</div>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <SoftLink label="View full trade log" hint="Review trades, filters, tags, notes" />
          <SoftLink label="Adjust strategy" hint="Criteria, risk, schedule, safeguards" />
          <SoftLink label="Live control" hint="Pause, kill-switch, account + symbol selection" />
        </div>
      </section>

      {/* OPTIONAL: show last events (quiet, for confidence) */}
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          background: "var(--card)",
          color: "var(--card-foreground)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Recent system notes</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Last 5</div>
        </div>

        {events.length === 0 ? (
          <div style={{ marginTop: 10, color: "var(--muted-foreground)" }}>No events yet.</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {events.slice(0, 5).map((e: any) => (
              <div
                key={e.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 12,
                  background: "var(--muted)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>{e.type}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ marginTop: 6, color: "var(--muted-foreground)" }}>{e.message}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: string;
  sub: string;
  emphasize?: boolean;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 14,
        background: "var(--card)",
        color: "var(--card-foreground)",
        boxShadow: emphasize ? "0 0 0 1px rgba(214,194,143,0.25)" : "none",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 0.2, color: "var(--muted-foreground)" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted-foreground)" }}>{sub}</div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 12,
        background: "var(--muted)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 14,
        background: "var(--card)",
        color: "var(--card-foreground)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>{value}</div>
    </section>
  );
}

function Pill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      style={{
        border: "1px solid var(--border)",
        background: active ? "rgba(214,194,143,0.25)" : "transparent",
        color: "var(--card-foreground)",
        borderRadius: 999,
        padding: "6px 10px",
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

function SoftLink({ label, hint }: { label: string; hint: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--muted)",
        borderRadius: 14,
        padding: "12px 12px",
      }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted-foreground)" }}>{hint}</div>
    </div>
  );
}
