export const dynamic = "force-dynamic";

export default function TradesAndLogsPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <h1 className="aura-page-title">Trades & Logs</h1>
        <p className="aura-page-subtitle">
          Review executed trades, orders, fills, and system events.
        </p>
      </div>

      {/* Page purpose / read-only notice */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <span className="aura-card-title">Read-only</span>
          <span className="aura-muted aura-text-xs">History & diagnostics</span>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-6">
          This page is for review and analysis only. Live execution and controls are available
          in Live Control.
        </p>
      </section>

      {/* Trades table placeholder */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Trades</div>
          <div className="aura-muted aura-text-xs">Completed & open positions</div>
        </div>

        <div className="aura-mt-12 aura-table" aria-label="Trades table placeholder">
          <div className="aura-table-header">
            <div>Time</div>
            <div>Symbol</div>
            <div>Side</div>
            <div className="aura-hide-sm">Setup</div>
            <div className="aura-right">Result</div>
          </div>

          {/* Placeholder rows */}
          {[...Array(5)].map((_, i) => (
            <div className="aura-table-row" key={i}>
              <div className="aura-skel aura-w-70" />
              <div className="aura-skel aura-w-55" />
              <div className="aura-skel aura-w-40" />
              <div className="aura-skel aura-w-85 aura-hide-sm" />
              <div className="aura-skel aura-w-55 aura-right" />
            </div>
          ))}
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Each row will link to a detailed trade view with orders, fills, and chart replay.
        </p>
      </section>

      {/* Orders & fills */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Orders & Fills</div>
          <div className="aura-muted aura-text-xs">Execution details</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Orders</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Fills</span>
            <span className="aura-muted">—</span>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Shows individual broker orders, partial fills, average fill prices, and timestamps.
        </p>
      </section>

      {/* Filters & export */}
      <section className="aura-card">
        <div className="aura-card-title">Filters & Export</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Date range</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Symbol</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Session</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Export trades & logs</span>
            <span className="aura-muted">CSV / JSON (placeholder)</span>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Filters help isolate specific sessions, symbols, or periods. Export is intended for
          journaling and external analysis.
        </p>
      </section>

      {/* System events / logs */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">System Events</div>
          <div className="aura-muted aura-text-xs">Diagnostics & audit trail</div>
        </div>

        <div className="aura-mt-12 aura-table" aria-label="System events placeholder">
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
          Includes strategy state changes, pauses, errors, broker responses, and execution events.
        </p>
      </section>

      {/* Coming soon */}
      <section className="aura-card">
        <div className="aura-card-title">Coming Soon</div>
        <p className="aura-muted aura-text-xs aura-mt-10">
          Trade replay on chart, per-trade metrics, tagging and notes, and advanced diagnostics.
        </p>
      </section>
    </div>
  );
}
