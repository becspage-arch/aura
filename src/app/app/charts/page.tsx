export default function ChartsPage() {
  return (
    <div className="aura-page">
      <div>
        <h1 className="aura-page-title">Charts</h1>
        <p className="aura-page-subtitle">
          View live price action, recent trades, and evaluated setups.
        </p>
      </div>

      {/* Chart Section */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Live Chart</div>
        </div>

        <div className="aura-chart-placeholder">
          <div className="aura-bar aura-bar-55"></div>
          <div className="aura-bar aura-bar-72"></div>
          <div className="aura-bar aura-bar-40"></div>
          <div className="aura-bar aura-bar-82"></div>
          <div className="aura-bar aura-bar-60"></div>
          <div className="aura-bar aura-bar-78"></div>
        </div>
      </section>

      {/* Last 24h Summary */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Last 24 Hours</div>
          <a href="/app/trades" className="aura-link aura-text-xs">
            View full report →
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

      {/* Evaluated Setups */}
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
