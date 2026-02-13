export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { TradingChart } from "@/components/charts/TradingChart";

export default async function ChartsPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl aura-page">
        <div>
          <h1 className="aura-page-title">Charts</h1>
          <p className="aura-page-subtitle">Sign in to view charts and trade activity.</p>
        </div>

        <section className="aura-card">
          <div className="aura-card-title">Not signed in</div>
          <p className="aura-muted aura-text-xs aura-mt-10">Please sign in to access Charts.</p>
        </section>
      </div>
    );
  }

  const channelName = `user:${user.id}`;
  const symbol = "MGC";

  return (
    <div className="mx-auto max-w-6xl aura-page">
      <div>
        <h1 className="aura-page-title">Charts</h1>
        <p className="aura-page-subtitle">
          Visual entries on the chart, plus a quick view of recent trades and evaluated setups.
        </p>
      </div>

      {/* Live chart */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Live Chart</div>
          <div className="aura-muted aura-text-xs">
            Channel: {channelName} â€¢ Symbol: {symbol}
          </div>
        </div>

        <div className="aura-mt-12">
          <TradingChart symbol={symbol} initialTf="15s" channelName={channelName} />
        </div>
      </section>

      {/* Last 24h Summary (placeholder structure for now) */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Last 24 Hours</div>
          <a href="/app/reports" className="aura-link aura-text-xs">
            View full report â†’
          </a>
        </div>

        <div className="aura-table aura-mt-12">
          <div className="aura-table-header">
            <div>Time</div>
            <div>Side</div>
            <div>Symbol</div>
            <div className="aura-hide-sm">Result</div>
            <div className="aura-right">R</div>
          </div>

          {[1, 2, 3].map((i) => (
            <div key={i} className="aura-table-row">
              <div>09:3{i}</div>
              <div>Buy</div>
              <div>MGC</div>
              <div className="aura-hide-sm">Take Profit</div>
              <div className="aura-right">+2.0R</div>
            </div>
          ))}
        </div>
      </section>

      {/* Evaluated Setups (placeholder structure for now) */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Evaluated Setups</div>
        </div>

        <div className="aura-table aura-mt-12">
          <div className="aura-table-header">
            <div>Time</div>
            <div>Symbol</div>
            <div>Status</div>
            <div className="aura-hide-sm">Reason</div>
            <div className="aura-right">Taken</div>
          </div>

          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aura-table-row">
              <div>08:{1 + i}5</div>
              <div>MGC</div>
              <div>Detected</div>
              <div className="aura-hide-sm">Session filter</div>
              <div className="aura-right">No</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

