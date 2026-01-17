export const dynamic = "force-dynamic";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <h1 className="aura-page-title">Settings</h1>
        <p className="aura-page-subtitle">
          Manage broker connections, notifications, safety caps, copy trading, and account preferences.
        </p>
      </div>

      {/* UI-only notice */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <span className="aura-card-title">UI only</span>
          <span className="aura-muted aura-text-xs">Not wired yet</span>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-6">
          Strategy rules live in{" "}
          <Link href="/app/strategy" className="aura-link aura-pill">
            Strategy
          </Link>
          . Live execution and charts live in{" "}
          <Link href="/app/live-control" className="aura-link aura-pill">
            Live Control
          </Link>
          .
        </p>
      </section>

      {/* Broker Connections */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Broker Connections</div>
          <div className="aura-muted aura-text-xs">Account access</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Connection status</div>
              <div className="aura-control-help">Whether Aura can reach your broker.</div>
            </div>
            <span className="aura-select-pill">Disconnected</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Environment</div>
              <div className="aura-control-help">Demo vs live trading environment.</div>
            </div>
            <span className="aura-select-pill">Demo (placeholder)</span>
          </div>
        </div>
      </section>

      {/* Copy Trading */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Copy Trading</div>
          <div className="aura-muted aura-text-xs">Multi-account routing</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12">
          <div className="aura-card-muted aura-control-row aura-disabled">
            <div className="aura-control-meta">
              <div className="aura-control-title">Master account</div>
              <div className="aura-control-help">
                Trades originate here and are copied to followers.
              </div>
            </div>
            <span className="aura-select-pill">—</span>
          </div>

          <div className="aura-card-muted aura-control-row aura-disabled">
            <div className="aura-control-meta">
              <div className="aura-control-title">Follower accounts</div>
              <div className="aura-control-help">
                Accounts that receive copied trades.
              </div>
            </div>
            <span className="aura-select-pill">0 connected</span>
          </div>

          <div className="aura-card-muted aura-control-row aura-disabled">
            <div className="aura-control-meta">
              <div className="aura-control-title">Allocation mode</div>
              <div className="aura-control-help">
                How position sizing is copied per follower.
              </div>
            </div>
            <span className="aura-select-pill">1:1 contracts</span>
          </div>

          <div className="aura-divider" />

          {/* IMPORTANT: this row is NOT disabled */}
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Manage copy trading</div>
              <div className="aura-control-help">
                Connect followers, set allocation, and monitor health.
              </div>
            </div>
            <Link href="/app/copy-trading" className="aura-btn">
              Open Copy Trading
            </Link>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Copy trading controls which accounts receive executions. Strategy logic remains unchanged.
        </p>
      </section>

      {/* Account Defaults */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Account Defaults</div>
          <div className="aura-muted aura-text-xs">Applies across Aura</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Default broker account</div>
              <div className="aura-control-help">
                Used if Live Control hasn’t selected an account.
              </div>
            </div>
            <span className="aura-select-pill">—</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Default symbol</div>
              <div className="aura-control-help">Pre-selected for new sessions.</div>
            </div>
            <span className="aura-select-pill">MGC</span>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Notifications</div>
          <div className="aura-muted aura-text-xs">Awareness without noise</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Trade opened</div>
              <div className="aura-control-help">Alert when a position is entered.</div>
            </div>
            <div className="aura-toggle" />
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Trade closed</div>
              <div className="aura-control-help">Alert when a position exits.</div>
            </div>
            <div className="aura-toggle aura-toggle-on" />
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Kill switch</div>
              <div className="aura-control-help">High-priority safety alert.</div>
            </div>
            <div className="aura-toggle aura-toggle-on" />
          </div>
        </div>
      </section>

      {/* Safety Caps */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Safety Caps</div>
          <div className="aura-muted aura-text-xs">Hard overrides</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Max daily loss</div>
              <div className="aura-control-help">
                Aura pauses automatically if reached.
              </div>
            </div>
            <span className="aura-select-pill">—</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Max open risk</div>
              <div className="aura-control-help">
                Caps total exposure across positions.
              </div>
            </div>
            <span className="aura-select-pill">—</span>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Preferences</div>
          <div className="aura-muted aura-text-xs">Display & behaviour</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Timezone</div>
              <div className="aura-control-help">
                Used for sessions, charts, and reporting.
              </div>
            </div>
            <span className="aura-select-pill">Europe/London</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Currency display</div>
              <div className="aura-control-help">Profit and risk formatting.</div>
            </div>
            <span className="aura-select-pill">GBP</span>
          </div>
        </div>
      </section>
    </div>
  );
}
