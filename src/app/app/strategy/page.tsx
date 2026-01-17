export const dynamic = "force-dynamic";

export default function StrategyPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <h1 className="aura-page-title">Strategy</h1>
        <p className="aura-page-subtitle">
          Configure how Aura executes the strategy on your account.
        </p>
      </div>

      {/* Strategy Mode */}
      <section className="aura-card">
        <div className="aura-card-title">Strategy Mode</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted">
            <div className="aura-row-between">
              <span>Paper Trading</span>
              <span className="aura-muted">Default</span>
            </div>
            <p className="aura-muted aura-text-xs aura-mt-6">
              Aura simulates trades using real market data without placing live orders.
            </p>
          </div>

          <div className="aura-card-muted">
            <div className="aura-row-between">
              <span>Live Trading</span>
              <span className="aura-muted">Disabled</span>
            </div>
            <p className="aura-muted aura-text-xs aura-mt-6">
              Executes real orders through your connected broker account. Additional confirmations
              will be required before enabling.
            </p>
          </div>
        </div>
      </section>

      {/* Strategy Preset */}
      <section className="aura-card">
        <div className="aura-card-title">Strategy Preset</div>

        <div className="aura-mt-12 aura-card-muted">
          <div className="aura-row-between">
            <span>Active Strategy</span>
            <span className="aura-font-semibold">315 CorePlus</span>
          </div>
          <p className="aura-muted aura-text-xs aura-mt-6">
            Aura currently operates a single validated production strategy. Core logic is fixed to
            protect consistency and execution quality.
          </p>
        </div>
      </section>

      {/* Symbols */}
      <section className="aura-card">
        <div className="aura-card-title">Tradable Symbols</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Micro Gold (MGC)</span>
            <span className="aura-muted">Enabled</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Aura only trades markets that meet liquidity and structural requirements for the
            strategy. Enabling fewer symbols reduces exposure.
          </p>
        </div>
      </section>

      {/* Sessions */}
      <section className="aura-card">
        <div className="aura-card-title">Trading Sessions</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>New York Session</span>
            <span className="aura-muted">Enabled</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>London Session</span>
            <span className="aura-muted">Disabled</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Aura will only execute trades during selected sessions to avoid low-quality or
            illiquid conditions.
          </p>
        </div>
      </section>

      {/* Risk */}
      <section className="aura-card">
        <div className="aura-card-title">Risk Configuration</div>

        <div className="aura-mt-12 aura-card-muted">
          <div className="aura-row-between">
            <span>Risk per Trade</span>
            <span className="aura-muted">—</span>
          </div>
          <p className="aura-muted aura-text-xs aura-mt-6">
            Risk is calculated before each trade and enforced automatically. Stops and targets are
            placed at execution and not adjusted mid-trade.
          </p>
        </div>
      </section>

      {/* Execution Preferences */}
      <section className="aura-card">
        <div className="aura-card-title">Execution Preferences</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Allow multiple trades per session</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Allow trade stacking</span>
            <span className="aura-muted">—</span>
          </div>

          <p className="aura-muted aura-text-xs">
            These controls affect how often Aura is allowed to act. The underlying strategy logic
            remains unchanged.
          </p>
        </div>
      </section>

      {/* Safety */}
      <section className="aura-card">
        <div className="aura-card-title">Safety & Limits</div>

        <div className="aura-mt-12 aura-card-muted">
          <p className="aura-muted aura-text-xs">
            Aura includes system-level safety checks such as maximum loss thresholds and automatic
            pause conditions. Some safeguards cannot be disabled.
          </p>
        </div>
      </section>

      {/* Status Summary */}
      <section className="aura-card">
        <div className="aura-card-title">Strategy Status</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-row-between">
            <span className="aura-muted">Mode</span>
            <span>Paper</span>
          </div>

          <div className="aura-row-between">
            <span className="aura-muted">Strategy</span>
            <span>315 CorePlus</span>
          </div>

          <div className="aura-row-between">
            <span className="aura-muted">Symbols</span>
            <span>MGC</span>
          </div>

          <div className="aura-row-between">
            <span className="aura-muted">Sessions</span>
            <span>New York</span>
          </div>
        </div>
      </section>

      {/* Coming soon */}
      <section className="aura-card">
        <div className="aura-card-title">Coming Soon</div>
        <p className="aura-muted aura-text-xs aura-mt-10">
          Strategy variants, presets, per-symbol risk profiles, backtest summaries, and strategy
          version history.
        </p>
      </section>
    </div>
  );
}
