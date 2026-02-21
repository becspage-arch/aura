// src/components/dashboard/DashboardView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardStore";
import { fmtMoneyUsd, fmtTimeLondon } from "@/components/dashboard/dashboardFormat";
import type { DashboardSummary, RangeKey } from "@/lib/dashboard/types";

import DashboardKpiRow from "@/components/dashboard/sections/DashboardKpiRow";
import DashboardStatusStrip from "@/components/dashboard/sections/DashboardStatusStrip";
import DashboardPerformanceRow from "@/components/dashboard/sections/DashboardPerformanceRow";
import DashboardRecentTradesCard from "@/components/dashboard/sections/DashboardRecentTradesCard";
import DashboardChartsRow from "@/app/app/dashboard/_components/DashboardChartsRow";

export default function DashboardView({ clerkUserId }: { clerkUserId?: string }) {
  const { state, dispatch } = useDashboard();
  const [cumRange, setCumRange] = useState<RangeKey>("1Y");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/dashboard/summary?range=${cumRange}`, { method: "GET" });
        const json = (await res.json().catch(() => null)) as DashboardSummary | any;

        if (cancelled) return;

        if (res.ok && json?.ok === true) {
          dispatch({ type: "SET_SUMMARY", payload: json as DashboardSummary });
        } else if (res.ok) {
          console.error("DASHBOARD_SUMMARY_UNEXPECTED_SHAPE", json);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch, cumRange]);

  const channelName = useMemo(() => (clerkUserId ? `user:${clerkUserId}` : null), [clerkUserId]);

  const totalProfit = state.summary?.kpis ? fmtMoneyUsd(state.summary.kpis.totalProfitUsd) : "$—";
  const todayPnl = state.summary?.kpis ? fmtMoneyUsd(state.summary.kpis.todayPnlUsd) : "$—";
  const monthPnl = state.summary?.kpis ? fmtMoneyUsd(state.summary.kpis.monthPnlUsd) : "$—";
  const accountEquity =
    state.summary?.kpis?.accountEquityUsd != null ? fmtMoneyUsd(state.summary.kpis.accountEquityUsd) : "$—";

  const strategyStatus = state.summary?.status
    ? state.summary.status.strategy === "PAUSED"
      ? "Paused"
      : "Active"
    : state.tradingState?.isPaused
      ? "Paused"
      : "Active";

  const tradingStatus = state.summary?.status
    ? state.summary.status.trading === "STOPPED"
      ? "Stopped"
      : "Live"
    : state.tradingState?.isKillSwitched
      ? "Stopped"
      : "Live";

  const brokerStatus = state.summary?.status?.broker ?? "Unknown";
  const symbol = state.summary?.status?.symbol ?? state.tradingState?.selectedSymbol ?? "MGC";
  const riskMode = state.summary?.status?.riskMode ?? "Normal";
  const lastTrade = state.summary?.status?.lastTradeAt ? fmtTimeLondon(state.summary.status.lastTradeAt) : "—";

  const perf = state.summary?.performance30d ?? null;

  const recentTrades = state.summary?.recentTrades ?? null;

  return (
    <div className="aura-page">
      <div className="aura-row-between">
        <div>
          <p className="aura-page-subtitle">Profit-first overview. Calm, clear, in control.</p>
        </div>
      </div>

      <DashboardKpiRow
        totalProfit={totalProfit}
        todayPnl={todayPnl}
        monthPnl={monthPnl}
        accountEquity={accountEquity}
      />

      <DashboardStatusStrip
        channelName={channelName}
        strategyStatus={strategyStatus}
        tradingStatus={tradingStatus}
        brokerStatus={brokerStatus}
        symbol={symbol}
        riskMode={riskMode}
        lastTrade={lastTrade}
      />

      {state.summary?.charts ? (
        <DashboardChartsRow
          cumulative={state.summary.charts.cumulativePnl}
          monthCalendar={state.summary.charts.monthCalendar}
        />
      ) : null}

      <DashboardPerformanceRow perf={perf} />

      <DashboardRecentTradesCard trades={recentTrades} />
    </div>
  );
}
