"use client";

import { useMemo } from "react";
import { useDashboard } from "@/components/dashboard/DashboardStore";

export default function DashboardView({ clerkUserId }: { clerkUserId?: string }) {
  const { state } = useDashboard();

  const channelName = useMemo(
    () => (clerkUserId ? `user:${clerkUserId}` : null),
    [clerkUserId]
  );

  // Placeholder values for now (wire later)
  const totalProfit = "£—";
  const todayPnl = "£—";
  const monthPnl = "£—";

  // “Account” placeholders (still UI-only)
  const accountEquity = "£—";
  const allUsersProfit = "£—";

  const strategyStatus = state.tradingState?.isPaused ? "Paused" : "Active";
  const tradingStatus = state.tradingState?.isKillSwitched ? "Stopped" : "Live";
  const brokerStatus = "Connected"; // placeholder until we surface broker status
  const symbol = state.tradingState?.selectedSymbol ?? "MGC";
  const riskMode = "Normal"; // placeholder
  const lastTrade = "—"; // placeholder

  return (
    <div className="aura-page">
      {/* Header */}
      <div className="aura-row-between">
        <div>
          <h1 className="aura-page-title">Dashboard</h1>
          <p className="aura-page-subtitle">
            Profit-first overview. Calm, clear, in control.
          </p>
        </div>
      </div>

      {/* Section 1: Profit at a glance (personal/account level) */}
      <section className="aura-grid-4">
        <div className="aura-card">
          <div className="aura-stat-label">Total Profit</div>
          <div className="aura-stat-value">{totalProfit}</div>
          <div className="aura-stat-sub">All time</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Today</div>
          <div className="aura-stat-value">{todayPnl}</div>
          <div className="aura-stat-sub">Since 00:00</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">This Month</div>
          <div className="aura-stat-value">{monthPnl}</div>
          <div className="aura-stat-sub">Calendar month</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Account Equity</div>
          <div className="aura-stat-value">{accountEquity}</div>
          <div className="aura-stat-sub">Live account value</div>
        </div>
      </section>

      {/* Section 2: System status (read-only) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">System Status</div>
          <div className="aura-muted" style={{ fontSize: 12 }}>
            Channel: {channelName ?? "—"}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div className="aura-row-between">
            <span className="aura-muted">Strategy</span>
            <span>{strategyStatus}</span>
          </div>

          <div className="aura-row-between">
            <span className="aura-muted">Trading</span>
            <span>{tradingStatus}</span>
          </div>

          <div className="aura-row-between">
            <span className="aura-muted">Broker</span>
            <span>{brokerStatus}</span>
          </div>

          <div className="aura-row-between">
            <span className="aura-muted">Symbol</span>
            <span>{symbol}</span>
          </div>

          <div className="aura-row-between">
            <span className="aura-muted">Risk Mode</span>
            <span>{riskMode}</span>
          </div>

          <div className="aura-row-between">
            <span className="aura-muted">Last trade</span>
            <span>{lastTrade}</span>
          </div>
        </div>
      </section>

      {/* Section 3: Cumulative P&L by day (wireframe placeholder) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Cumulative P&L (Daily)</div>
          <div className="aura-muted" style={{ fontSize: 12 }}>
            Last 14 days
          </div>
        </div>

        <div
          className="aura-chart-placeholder"
          aria-label="Cumulative P&L placeholder chart"
        >
          <div className="aura-bar" style={{ height: "35%" }} />
          <div className="aura-bar" style={{ height: "42%" }} />
          <div className="aura-bar" style={{ height: "40%" }} />
          <div className="aura-bar" style={{ height: "55%" }} />
          <div className="aura-bar" style={{ height: "60%" }} />
          <div className="aura-bar" style={{ height: "68%" }} />
          <div className="aura-bar" style={{ height: "72%" }} />
          <div className="aura-bar" style={{ height: "78%" }} />
          <div className="aura-bar" style={{ height: "82%" }} />
          <div className="aura-bar" style={{ height: "88%" }} />
          <div className="aura-bar" style={{ height: "92%" }} />
          <div className="aura-bar" style={{ height: "96%" }} />
          <div className="aura-bar" style={{ height: "100%" }} />
          <div className="aura-bar" style={{ height: "98%" }} />
        </div>

        <p className="aura-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Placeholder only. We’ll wire real daily P&L later.
        </p>
      </section>

      {/* Section 4: Performance ratios (placeholder) */}
      <section className="aura-grid-4">
        <div className="aura-card">
          <div className="aura-stat-label">Win Rate</div>
          <div className="aura-mini-value">—%</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Profit Factor</div>
          <div className="aura-mini-value">—</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Avg R:R</div>
          <div className="aura-mini-value">—R</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Max Drawdown</div>
          <div className="aura-mini-value">—%</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>
      </section>

      {/* Section 5: Recent trades (placeholder) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Recent Trades</div>
          <div className="aura-muted" style={{ fontSize: 12 }}>
            Last 5
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="aura-card-muted aura-row-between">
            <span className="aura-muted">—</span>
            <span>—</span>
          </div>
          <div className="aura-card-muted aura-row-between">
            <span className="aura-muted">—</span>
            <span>—</span>
          </div>
          <div className="aura-card-muted aura-row-between">
            <span className="aura-muted">—</span>
            <span>—</span>
          </div>
          <div className="aura-card-muted aura-row-between">
            <span className="aura-muted">—</span>
            <span>—</span>
          </div>
          <div className="aura-card-muted aura-row-between">
            <span className="aura-muted">—</span>
            <span>—</span>
          </div>
        </div>

        <p className="aura-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Placeholder only. The full trade log lives in Trades & Logs.
        </p>
      </section>

      {/* Section 6: Aura-wide (belongs near the bottom) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Aura Network</div>
          <div className="aura-muted" style={{ fontSize: 12 }}>
            Platform-wide (placeholder)
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="aura-row-between">
            <span className="aura-muted">Aura Profit (All Users)</span>
            <span style={{ fontWeight: 600 }}>{allUsersProfit}</span>
          </div>

          <p className="aura-muted" style={{ marginTop: 6, fontSize: 12 }}>
            This is intentionally placed lower - it’s interesting, but not the
            user’s primary “what do I need to do right now?” metric.
          </p>
        </div>
      </section>
    </div>
  );
}
