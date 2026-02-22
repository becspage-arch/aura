// src/components/dashboard/sections/DashboardPerformanceRow.tsx
"use client";

import { fmtFixed, fmtMoneyUsd } from "@/components/dashboard/dashboardFormat";

export default function DashboardPerformanceRow({ perf }: { perf: any | null }) {
  return (
    <section className="aura-kpi-row">
      <div className="aura-card">
        <div className="aura-stat-label">Win Rate</div>
        <div className="aura-mini-value">{perf ? `${Math.round(perf.winRatePct)}%` : "—%"}</div>
        <div className="aura-stat-sub">Last 30 days</div>
      </div>

      <div className="aura-card">
        <div className="aura-stat-label">Profit Factor</div>
        <div className="aura-mini-value">{perf ? fmtFixed(perf.profitFactor, 2) : "—"}</div>
        <div className="aura-stat-sub">Last 30 days</div>
      </div>

      <div className="aura-card">
        <div className="aura-stat-label">Avg R:R</div>
        <div className="aura-mini-value">{perf ? `${fmtFixed(perf.avgRR, 2)}R` : "—R"}</div>
        <div className="aura-stat-sub">Last 30 days</div>
      </div>

      <div className="aura-card">
        <div className="aura-stat-label">Max Drawdown</div>
        <div className="aura-mini-value">{perf?.maxDrawdownUsd != null ? fmtMoneyUsd(perf.maxDrawdownUsd) : "—"}</div>
        <div className="aura-stat-sub">Last 30 days</div>
      </div>
    </section>
  );
}
