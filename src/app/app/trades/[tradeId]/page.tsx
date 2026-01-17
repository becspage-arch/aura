export const dynamic = "force-dynamic";

import Link from "next/link";

type PageProps = {
  params: Promise<{ tradeId: string }>;
};

export default async function TradeDetailPage({ params }: PageProps) {
  const { tradeId } = await params;

  return (
    <div className="mx-auto max-w-6xl aura-page">
      <div className="aura-row-between">
        <div>
          <h1 className="aura-page-title">Trade Detail</h1>
          <p className="aura-page-subtitle">Trade ID: {tradeId}</p>
        </div>

        <Link href="/app/trades" className="aura-pill aura-link">
          Back to Trades
        </Link>
      </div>

      {/* Summary */}
      <section className="aura-card">
        <div className="aura-card-title">Summary</div>
        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-row-between">
            <span className="aura-muted">Symbol</span>
            <span>—</span>
          </div>
          <div className="aura-row-between">
            <span className="aura-muted">Side</span>
            <span>—</span>
          </div>
          <div className="aura-row-between">
            <span className="aura-muted">Entry</span>
            <span>—</span>
          </div>
          <div className="aura-row-between">
            <span className="aura-muted">Stop</span>
            <span>—</span>
          </div>
          <div className="aura-row-between">
            <span className="aura-muted">Target</span>
            <span>—</span>
          </div>
          <div className="aura-row-between">
            <span className="aura-muted">Result</span>
            <span>—</span>
          </div>
        </div>
      </section>

      {/* Orders */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Orders</div>
          <div className="aura-muted aura-text-xs">Placeholder</div>
        </div>

        <div className="aura-mt-12 aura-table" aria-label="Orders placeholder">
          <div className="aura-table-header">
            <div>Time</div>
            <div>Status</div>
            <div className="aura-hide-sm">Type</div>
            <div className="aura-right">Price</div>
          </div>

          {[...Array(3)].map((_, i) => (
            <div className="aura-table-row" key={i}>
              <div className="aura-skel aura-w-55" />
              <div className="aura-skel aura-w-40" />
              <div className="aura-skel aura-w-55 aura-hide-sm" />
              <div className="aura-skel aura-w-40 aura-right" />
            </div>
          ))}
        </div>
      </section>

      {/* Fills */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Fills</div>
          <div className="aura-muted aura-text-xs">Placeholder</div>
        </div>

        <div className="aura-mt-12 aura-table" aria-label="Fills placeholder">
          <div className="aura-table-header">
            <div>Time</div>
            <div>Qty</div>
            <div className="aura-hide-sm">Side</div>
            <div className="aura-right">Fill Price</div>
          </div>

          {[...Array(3)].map((_, i) => (
            <div className="aura-table-row" key={i}>
              <div className="aura-skel aura-w-55" />
              <div className="aura-skel aura-w-40" />
              <div className="aura-skel aura-w-55 aura-hide-sm" />
              <div className="aura-skel aura-w-40 aura-right" />
            </div>
          ))}
        </div>
      </section>

      {/* Audit trail */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Audit Trail</div>
          <div className="aura-muted aura-text-xs">Events & diagnostics</div>
        </div>

        <div className="aura-mt-12 aura-table" aria-label="Audit trail placeholder">
          <div className="aura-table-header">
            <div>Time</div>
            <div>Level</div>
            <div className="aura-hide-sm">Type</div>
            <div>Message</div>
          </div>

          {[...Array(4)].map((_, i) => (
            <div className="aura-table-row" key={i}>
              <div className="aura-skel aura-w-55" />
              <div className="aura-skel aura-w-40" />
              <div className="aura-skel aura-w-55 aura-hide-sm" />
              <div className="aura-skel aura-w-85" />
            </div>
          ))}
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          This will show the full sequence of events: signal → order submitted → fills → exits → any pauses or errors.
        </p>
      </section>

      {/* Chart replay placeholder */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Chart Replay</div>
          <div className="aura-muted aura-text-xs">Coming soon</div>
        </div>

        <div className="aura-chart-placeholder" aria-label="Chart replay placeholder">
          <div className="aura-bar aura-bar-42" />
          <div className="aura-bar aura-bar-55" />
          <div className="aura-bar aura-bar-60" />
          <div className="aura-bar aura-bar-72" />
          <div className="aura-bar aura-bar-88" />
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Replay will show the setup context and exact execution markers on the chart.
        </p>
      </section>
    </div>
  );
}
