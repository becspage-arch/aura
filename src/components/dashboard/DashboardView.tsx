// src/components/dashboard/DashboardView.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useDashboard } from "@/components/dashboard/DashboardStore";

export default function DashboardView({ clerkUserId }: { clerkUserId?: string }) {
  const { state, dispatch } = useDashboard();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard/summary", { method: "GET" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          dispatch({ type: "SET_SUMMARY", payload: json });
        }
      } catch {
        // ignore for now
      }
    }
    load();
  }, [dispatch]);

  const channelName = useMemo(
    () => (clerkUserId ? `user:${clerkUserId}` : null),
    [clerkUserId]
  );

  const totalProfit = state.summary ? `$${state.summary.kpis.totalProfitUsd}` : "$—";
  const todayPnl = state.summary ? `$${state.summary.kpis.todayPnlUsd}` : "$—";
  const monthPnl = state.summary ? `$${state.summary.kpis.monthPnlUsd}` : "$—";

  const accountEquity =
    state.summary?.kpis?.accountEquityUsd != null
      ? `$${state.summary.kpis.accountEquityUsd}`
      : "$—";

  const allUsersProfit = "$—";

  const strategyStatus = state.summary
    ? state.summary.status.strategy === "PAUSED"
      ? "Paused"
      : "Active"
    : state.tradingState?.isPaused
      ? "Paused"
      : "Active";

  const tradingStatus = state.summary
    ? state.summary.status.trading === "STOPPED"
      ? "Stopped"
      : "Live"
    : state.tradingState?.isKillSwitched
      ? "Stopped"
      : "Live";

  const brokerStatus = state.summary?.status?.broker ?? "Unknown";
  const symbol = state.summary?.status?.symbol ?? state.tradingState?.selectedSymbol ?? "MGC";
  const riskMode = state.summary?.status?.riskMode ?? "Normal";

  const lastTrade =
    state.summary?.status?.lastTradeAt
      ? new Date(state.summary.status.lastTradeAt).toLocaleTimeString()
      : "—";

  return (
    <div className="aura-page">
      {/* Header */}
      <div className="aura-row-between">
        <div>
          <p className="aura-page-subtitle">Profit-first overview. Calm, clear, in control.</p>
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

      {/* Section 2: System status (calm health strip) */}
      <section className="aura-card aura-health">
        <div className="aura-health-top">
          <div className="aura-card-title">System Status</div>
          <div className="aura-muted aura-text-xs">Channel: {channelName ?? "—"}</div>
        </div>

        <div className="aura-health-strip" aria-label="System status">
          <div className="aura-health-pill">
            <span className="aura-health-key">Strategy</span>
            <span className="aura-health-val">{strategyStatus}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Trading</span>
            <span className="aura-health-val">{tradingStatus}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Broker</span>
            <span className="aura-health-val">{brokerStatus}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Symbol</span>
            <span className="aura-health-val">{symbol}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Risk</span>
            <span className="aura-health-val">{riskMode}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Last trade</span>
            <span className="aura-health-val">{lastTrade}</span>
          </div>
        </div>
      </section>

      {/* Section 3: Cumulative P&L by day (wireframe placeholder) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Cumulative P&L (Daily)</div>
          <div className="aura-muted aura-text-xs">Last 14 days</div>
        </div>

        <div className="aura-chart-placeholder" aria-label="Cumulative P&L placeholder chart">
          <div className="aura-bar aura-bar-35" />
          <div className="aura-bar aura-bar-42" />
          <div className="aura-bar aura-bar-40" />
          <div className="aura-bar aura-bar-55" />
          <div className="aura-bar aura-bar-60" />
          <div className="aura-bar aura-bar-68" />
          <div className="aura-bar aura-bar-72" />
          <div className="aura-bar aura-bar-78" />
          <div className="aura-bar aura-bar-82" />
          <div className="aura-bar aura-bar-88" />
          <div className="aura-bar aura-bar-92" />
          <div className="aura-bar aura-bar-96" />
          <div className="aura-bar aura-bar-100" />
          <div className="aura-bar aura-bar-98" />
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">Placeholder only. We’ll wire real daily P&L later.</p>
      </section>

      {/* Section 4: Performance ratios */}
      <section className="aura-grid-4">
        <div className="aura-card">
          <div className="aura-stat-label">Win Rate</div>
          <div className="aura-mini-value">
            {state.summary
              ? `${Math.round(state.summary.performance30d.winRatePct)}%`
              : "—%"}
          </div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Profit Factor</div>
          <div className="aura-mini-value">
            {state.summary
              ? state.summary.performance30d.profitFactor.toFixed(2)
              : "—"}
          </div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Avg R:R</div>
          <div className="aura-mini-value">
            {state.summary
              ? `${state.summary.performance30d.avgRR.toFixed(2)}R`
              : "—R"}
          </div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Max Drawdown</div>
          <div className="aura-mini-value">
            {state.summary?.performance30d?.maxDrawdownUsd != null
              ? `$${state.summary.performance30d.maxDrawdownUsd}`
              : "—"}
          </div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>
      </section>

      {/* Section 5: Recent trades */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Recent Trades</div>
          <div className="aura-muted aura-text-xs">Last 10</div>
        </div>

        <div className="aura-mt-12 aura-table" role="table" aria-label="Recent trades table">
          <div className="aura-table-header" role="row">
            <div role="columnheader">Time</div>
            <div role="columnheader">Symbol</div>
            <div role="columnheader">Side</div>
            <div role="columnheader" className="aura-hide-sm">Exit</div>
            <div role="columnheader" className="aura-right">
              Result
            </div>
          </div>

          {state.summary?.recentTrades?.length ? (
            state.summary.recentTrades.map((t: any) => (
              <div className="aura-table-row" role="row" key={t.execKey}>
                <div>{new Date(t.closedAt).toLocaleTimeString()}</div>
                <div>{t.symbol}</div>
                <div>{t.side}</div>
                <div className="aura-hide-sm">{t.exitReason}</div>
                <div className="aura-right">${t.realizedPnlUsd}</div>
              </div>
            ))
          ) : (
            <div className="aura-table-row" role="row">
              <div className="aura-muted">—</div>
              <div className="aura-muted">—</div>
              <div className="aura-muted">—</div>
              <div className="aura-muted aura-hide-sm">—</div>
              <div className="aura-muted aura-right">—</div>
            </div>
          )}
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">The full trade log lives in Trades & Logs.</p>
      </section>

      {/* Section 6: Aura-wide (belongs near the bottom) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Aura Network</div>
          <div className="aura-muted aura-text-xs">Platform-wide (placeholder)</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-row-between">
            <span className="aura-muted">Aura Profit (All Users)</span>
            <span className="aura-font-semibold">{allUsersProfit}</span>
          </div>

          <p className="aura-muted aura-text-xs aura-mt-6">
            To add any other site wide metrics or status info we want to share here
          </p>
        </div>
      </section>
    </div>
  );
}
