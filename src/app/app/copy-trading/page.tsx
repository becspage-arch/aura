export const dynamic = "force-dynamic";

import Link from "next/link";

export default function CopyTradingPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      <div className="aura-row-between">
        <div>
          <h1 className="aura-page-title">Copy Trading</h1>
          <p className="aura-page-subtitle">
            Connect multiple accounts and route trades from a master to follower accounts.
          </p>
        </div>

        <Link href="/app/account" className="aura-pill aura-link">
          Back to Settings
        </Link>
      </div>

      {/* Read-only / UI-only notice */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <span className="aura-card-title">UI only</span>
          <span className="aura-muted aura-text-xs">Not wired yet</span>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-6">
          Copy Trading is configuration. Live execution and monitoring remains in Live Control.
        </p>
      </section>

      {/* Master account */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Master Account</div>
          <div className="aura-muted aura-text-xs">Origin of trades</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Select master account</div>
              <div className="aura-control-help">This accountâ€™s fills are copied to followers.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">â€”</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Master status</div>
              <div className="aura-control-help">Connection, permissions, and routing readiness.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Not connected (placeholder)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Followers */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Follower Accounts</div>
          <div className="aura-muted aura-text-xs">Receivers of copied trades</div>
        </div>

        <div className="aura-mt-12 aura-table" aria-label="Follower accounts placeholder table">
          <div className="aura-table-header">
            <div>Broker</div>
            <div>Account</div>
            <div className="aura-hide-sm">Mode</div>
            <div className="aura-right">Status</div>
          </div>

          {[...Array(4)].map((_, i) => (
            <div className="aura-table-row" key={i}>
              <div className="aura-skel aura-w-55" />
              <div className="aura-skel aura-w-70" />
              <div className="aura-skel aura-w-55 aura-hide-sm" />
              <div className="aura-skel aura-w-55 aura-right" />
            </div>
          ))}
        </div>

        <div className="aura-mt-10 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Add follower</div>
              <div className="aura-control-help">Connect another broker account to receive copied trades.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Coming soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* Allocation */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Allocation</div>
          <div className="aura-muted aura-text-xs">Position sizing rules</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Allocation mode</div>
              <div className="aura-control-help">How copied sizing is calculated.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">1:1 contracts</span>
              <span className="aura-select-pill">% scaling</span>
              <span className="aura-select-pill">Fixed contracts</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Symbol mapping</div>
              <div className="aura-control-help">Map symbols per broker if needed (e.g., MGC â†” GC).</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Same symbol only (placeholder)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Per-Follower Safety</div>
          <div className="aura-muted aura-text-xs">Overrides</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Max position size</div>
              <div className="aura-control-help">Caps contracts per follower.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">â€”</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Max daily loss</div>
              <div className="aura-control-help">Auto-pause follower routing if hit.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">â€”</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Allow trading</div>
              <div className="aura-control-help">Enable/disable routing to a follower account.</div>
            </div>
            <div className="aura-control-right">
              <div className="aura-toggle aura-toggle-on" aria-label="Allow follower trading (disabled)" />
            </div>
          </div>
        </div>
      </section>

      {/* Coming soon */}
      <section className="aura-card">
        <div className="aura-card-title">Coming Soon</div>
        <p className="aura-muted aura-text-xs aura-mt-10">
          Follower health monitoring, lag detection, per-follower exclusions, and a full routing audit trail.
        </p>
      </section>
    </div>
  );
}

