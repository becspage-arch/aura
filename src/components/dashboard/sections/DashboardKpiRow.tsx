// src/components/dashboard/sections/DashboardKpiRow.tsx
"use client";

export default function DashboardKpiRow({
  totalProfit,
  todayPnl,
  monthPnl,
  accountEquity,
}: {
  totalProfit: string;
  todayPnl: string;
  monthPnl: string;
  accountEquity: string;
}) {
  return (
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
  );
}
