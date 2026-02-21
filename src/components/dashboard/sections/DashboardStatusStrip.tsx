// src/components/dashboard/sections/DashboardStatusStrip.tsx
"use client";

export default function DashboardStatusStrip({
  channelName,
  strategyStatus,
  tradingStatus,
  brokerStatus,
  symbol,
  riskMode,
  lastTrade,
}: {
  channelName: string | null;
  strategyStatus: string;
  tradingStatus: string;
  brokerStatus: string;
  symbol: string;
  riskMode: string;
  lastTrade: string;
}) {
  return (
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
  );
}
