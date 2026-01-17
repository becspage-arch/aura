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

      {/* Strategy Status (mini dashboard overview) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Strategy Status</div>
          <div className="aura-muted aura-text-xs">Overview</div>
        </div>

        <div className="aura-mt-12 aura-health-strip" aria-label="Strategy status overview">
          <div className="aura-health-pill">
            <span className="aura-health-key">Mode</span>
            <span className="aura-health-val">Paper</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Strategy</span>
            <span className="aura-health-val">315 CorePlus</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Symbol(s)</span>
            <span className="aura-health-val">MGC</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Sessions</span>
            <span className="aura-health-val">NY</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Risk</span>
            <span className="aura-health-val">—</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">State</span>
            <span className="aura-health-val">Locked</span>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          This summary reflects the current configuration Aura would run with. (UI only for now.)
        </p>
      </section>

      {/* Strategy lock notice */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <span className="aura-card-title">Strategy Locked</span>
          <span className="aura-muted aura-text-xs">Read-only</span>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-6">
          Strategy settings are locked while Live Control is running. To make changes, pause or
          stop Aura from the Live Control page.
        </p>
      </section>

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
            <span className="aura-muted">315 CorePlus</span>
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
            <span>Asian Session</span>
            <span className="aura-muted">Disabled</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>London Session</span>
            <span className="aura-muted">Disabled</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>New York Session</span>
            <span className="aura-muted">Enabled</span>
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

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Risk per Trade</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Risk Type</span>
            <span className="aura-muted">Percent / Fixed (placeholder)</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Risk is calculated before each trade and enforced automatically. Stops and targets are
            placed at execution and not adjusted mid-trade.
          </p>
        </div>
      </section>

      {/* 315 CorePlus Options (user-tunable guardrails + filters) */}
      <section className="aura-card">
        <div className="aura-card-title">315 CorePlus Options</div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          These settings adjust guardrails and filters for execution. They do not expose or rewrite
          the underlying strategy logic. (UI only for now.)
        </p>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Max stop-outs per session</span>
            <span className="aura-muted">—</span>
          </div>
          <p className="aura-muted aura-text-xs">
            If Aura hits the maximum number of stop-outs in a session, it will stop taking new entries
            until the next session window.
          </p>

          <div className="aura-card-muted aura-row-between">
            <span>Cooldown after stop-out</span>
            <span className="aura-muted">—</span>
          </div>
          <p className="aura-muted aura-text-xs">
            Adds a cooling-off window after a loss before Aura can take another setup.
          </p>

          <div className="aura-card-muted aura-row-between">
            <span>Expansion candle EMA filter</span>
            <span className="aura-muted">Require ≥ 50% beyond EMA (placeholder)</span>
          </div>
          <p className="aura-muted aura-text-xs">
            Only allow entries when the expansion candle shows decisive commitment relative to the EMA.
          </p>

          <div className="aura-card-muted aura-row-between">
            <span>Require candle body dominance</span>
            <span className="aura-muted">90%+ on one side (placeholder)</span>
          </div>
          <p className="aura-muted aura-text-xs">
            Filters out mixed candles and reduces “messy” entries around the EMA.
          </p>

          <div className="aura-card-muted aura-row-between">
            <span>Entry timing window</span>
            <span className="aura-muted">Immediate / Wait-for-confirm (placeholder)</span>
          </div>
          <p className="aura-muted aura-text-xs">
            Controls whether Aura enters on the first valid trigger or requires an additional confirmation step.
          </p>

          <div className="aura-card-muted aura-row-between">
            <span>Max trades per session</span>
            <span className="aura-muted">—</span>
          </div>
          <p className="aura-muted aura-text-xs">
            Hard cap on the number of trades Aura may take in a single session window.
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

          <div className="aura-card-muted aura-row-between">
            <span>Require flat before new entry</span>
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

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Max daily loss</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Max consecutive losses</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Auto-pause conditions</span>
            <span className="aura-muted">Enabled (placeholder)</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Aura includes system-level safety checks such as loss thresholds and automatic pause
            conditions. Some safeguards cannot be disabled.
          </p>
        </div>
      </section>

      {/* Coming soon */}
      <section className="aura-card">
        <div className="aura-card-title">Coming Soon</div>
        <p className="aura-muted aura-text-xs aura-mt-10">
          Per-symbol risk profiles, backtest summaries, strategy changelog/version history, and advanced
          filters (news windows, volatility/spread checks, execution slippage limits).
        </p>
      </section>
    </div>
  );
}
