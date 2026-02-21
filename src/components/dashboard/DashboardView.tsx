// src/components/dashboard/DashboardView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardStore";
import { fmtMoneyUsd, fmtTimeLondon } from "@/components/dashboard/dashboardFormat";

import DashboardKpiRow from "@/components/dashboard/sections/DashboardKpiRow";
import DashboardStatusStrip from "@/components/dashboard/sections/DashboardStatusStrip";
import DashboardCumulativePnlCard from "@/components/dashboard/sections/DashboardCumulativePnlCard";
import DashboardMonthlyPnlCard from "@/components/dashboard/sections/DashboardMonthlyPnlCard";
import DashboardPerformanceRow from "@/components/dashboard/sections/DashboardPerformanceRow";
import DashboardRecentTradesCard from "@/components/dashboard/sections/DashboardRecentTradesCard";

function normalizeSummary(raw: any) {
  if (!raw) return null;
  if (raw?.ok && raw?.kpis) return raw;
  if (raw?.ok && raw?.data && raw.data?.kpis) return raw.data;
  if (raw?.kpis) return raw;
  return null;
}

export default function DashboardView({ clerkUserId }: { clerkUserId?: string }) {
  const { state, dispatch } = useDashboard();
  const [cumRange, setCumRange] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("1Y");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/summary?range=${cumRange}`, { method: "GET" });
        const json = await res.json().catch(() => null);
        if (res.ok) {
          const normalized = normalizeSummary(json);
          if (normalized) {
            dispatch({ type: "SET_SUMMARY", payload: normalized });
          } else if (json?.ok) {
            console.error("DASHBOARD_SUMMARY_UNEXPECTED_SHAPE", json);
          }
        }
      } catch {
        // ignore
      }
    }
    load();
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

  const cumulativePoints = state.summary?.charts?.cumulativePnl?.points ?? null;
  const monthCalendar = state.summary?.charts?.monthCalendar ?? null;
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

      {/* Charts (designer will later place these side-by-side) */}
      <DashboardCumulativePnlCard points={cumulativePoints} cumRange={cumRange} setCumRange={setCumRange} />
      <DashboardMonthlyPnlCard monthCalendar={monthCalendar} />

      <DashboardPerformanceRow perf={perf} />

      <DashboardRecentTradesCard trades={recentTrades} />
    </div>
  );
}
