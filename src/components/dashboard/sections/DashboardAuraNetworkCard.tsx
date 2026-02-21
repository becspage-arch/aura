// src/components/dashboard/sections/DashboardAuraNetworkCard.tsx
"use client";

import { fmtMoneyUsd } from "@/components/dashboard/dashboardFormat";

export default function DashboardAuraNetworkCard(props: {
  activeTraders30d: number | null;
  uptimePct24h: number | null;
  signalsToday: number | null;
  totalProfitAllTradersUsd: string | null;
}) {
  const profit =
    props.totalProfitAllTradersUsd != null ? fmtMoneyUsd(props.totalProfitAllTradersUsd) : "$—";

  const active = props.activeTraders30d ?? 0;
  const signals = props.signalsToday ?? 0;
  const uptime = props.uptimePct24h == null ? "—" : `${props.uptimePct24h}%`;

  return (
    <section className="aura-card aura-network">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Aura Network</div>
          <div className="aura-muted aura-text-xs">Community intelligence & signals</div>
        </div>
      </div>

      <div className="aura-grid-4" style={{ marginTop: 12 }}>
        <div className="aura-card">
          <div className="aura-stat-label">Active Traders</div>
          <div className="aura-stat-value">{active.toLocaleString()}</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Network Uptime</div>
          <div className="aura-stat-value">{uptime}</div>
          <div className="aura-stat-sub">Last 24 hours</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Signals Today</div>
          <div className="aura-stat-value">{signals.toLocaleString()}</div>
          <div className="aura-stat-sub">All strategies</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Total Profit</div>
          <div className="aura-stat-value">{profit}</div>
          <div className="aura-stat-sub">All traders, all time</div>
        </div>
      </div>
    </section>
  );
}
