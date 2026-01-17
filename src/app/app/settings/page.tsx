export const dynamic = "force-dynamic";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <h1 className="aura-page-title">Settings</h1>
        <p className="aura-page-subtitle">
          Manage broker connections, notifications, safety caps, and preferences.
        </p>
      </div>

      {/* UI-only notice */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <span className="aura-card-title">UI only</span>
          <span className="aura-muted aura-text-xs">Not wired yet</span>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-6">
          Strategy configuration lives in{" "}
          <Link className="aura-link aura-pill" href="/app/strategy">
            Strategy
          </Link>{" "}
          and live execution + chart monitoring lives in{" "}
          <Link className="aura-link aura-pill" href="/app/live-control">
            Live Control
          </Link>
          .
        </p>
      </section>

      {/* Broker connections */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Broker Connections</div>
          <div className="aura-muted aura-text-xs">Account access</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Connection status</div>
              <div className="aura-control-help">Shows whether Aura can reach your broker.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Disconnected</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Environment</div>
              <div className="aura-control-help">Demo / Live will be selectable once wired.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Demo (placeholder)</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Manage connection</div>
              <div className="aura-control-help">Connect, re-auth, and view linked accounts.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Coming soon</span>
            </div>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Broker connections control where Aura can place orders. Strategy settings cannot override
          broker-level restrictions.
        </p>
      </section>

            {/* Copy Trading */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Copy Trading</div>
          <div className="aura-muted aura-text-xs">Multi-account routing</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Master account</div>
              <div className="aura-control-help">Trades originate here and are copied to followers.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">—</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Follower accounts</div>
              <div className="aura-control-help">Accounts that receive copied trades.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">0 connected</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Allocation mode</div>
              <div className="aura-control-help">How position sizing is copied per follower.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">1:1 contracts (placeholder)</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Per-follower safety caps</div>
              <div className="aura-control-help">Optional limits that override copied orders.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Coming soon</span>
            </div>
          </div>

          <div className="aura-divider" />

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Manage copy trading</div>
              <div className="aura-control-help">Connect followers, set allocation, and monitor health.</div>
            </div>
            <div className="aura-control-right">
              <Link href="/app/copy-trading" className="aura-link aura-pill">
                Open
              </Link>
            </div>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Copy Trading is account infrastructure. Strategy defines the rules; copy trading controls which
          accounts receive the executions.
        </p>
      </section>

      {/* Account defaults */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Account Defaults</div>
          <div className="aura-muted aura-text-xs">Applies across Aura</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Default broker account</div>
              <div className="aura-control-help">Used when Live Control hasn’t selected an account.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">—</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Default symbol</div>
              <div className="aura-control-help">Pre-selected for Strategy and Live Control.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">MGC</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Default session</div>
              <div className="aura-control-help">Used for session-based filters and defaults.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">New York</span>
            </div>
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
              <div className="aura-control-help">Notify when Aura enters a position.</div>
            </div>
            <div className="aura-control-right">
              <div className="aura-toggle" aria-label="Trade opened notifications (disabled)" />
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Trade closed</div>
              <div className="aura-control-help">Notify when a position exits.</div>
            </div>
            <div className="aura-control-right">
              <div className="aura-toggle aura-toggle-on" aria-label="Trade closed notifications (disabled)" />
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Paused / resumed</div>
              <div className="aura-control-help">Notify when Aura changes run state.</div>
            </div>
            <div className="aura-control-right">
              <div className="aura-toggle" aria-label="Paused/resumed notifications (disabled)" />
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Kill switch activated</div>
              <div className="aura-control-help">High priority notification.</div>
            </div>
            <div className="aura-control-right">
              <div className="aura-toggle aura-toggle-on" aria-label="Kill switch notifications (disabled)" />
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">System errors</div>
              <div className="aura-control-help">Notify when execution is blocked or degraded.</div>
            </div>
            <div className="aura-control-right">
              <div className="aura-toggle aura-toggle-on" aria-label="System error notifications (disabled)" />
            </div>
          </div>

          <div className="aura-divider" />

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Notification channel</div>
              <div className="aura-control-help">Email / push / SMS (future).</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Email (placeholder)</span>
            </div>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Notifications are designed to keep you informed without requiring constant monitoring.
        </p>
      </section>

      {/* Safety caps */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Safety Caps</div>
          <div className="aura-muted aura-text-xs">Hard limits</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Max daily loss (hard cap)</div>
              <div className="aura-control-help">If reached, Aura pauses and requires intervention.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">—</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Max weekly loss (hard cap)</div>
              <div className="aura-control-help">Longer horizon protection.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">—</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Max open risk at once</div>
              <div className="aura-control-help">Caps combined exposure across open positions.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">—</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Max consecutive losses</div>
              <div className="aura-control-help">Auto-pause after repeated losses.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">—</span>
            </div>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Safety caps override strategy-level settings. If a cap is reached, Aura will pause and
          require manual intervention in Live Control.
        </p>
      </section>

      {/* Preferences */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Preferences</div>
          <div className="aura-muted aura-text-xs">Personalise your view</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Timezone</div>
              <div className="aura-control-help">Used for sessions, charts, and reporting.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Europe/London</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Currency display</div>
              <div className="aura-control-help">How profits and risk appear across Aura.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">GBP</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Session labels</div>
              <div className="aura-control-help">Shown on Strategy, Performance, and filters.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Asia / London / NY</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Theme</div>
              <div className="aura-control-help">Theme toggle lives in Profile.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">Profile</span>
            </div>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Preferences affect how Aura presents information, not how trades are executed.
        </p>
      </section>

      {/* Data & Export */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Data & Export</div>
          <div className="aura-muted aura-text-xs">Portability</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Export trades</div>
              <div className="aura-control-help">For journaling and external analysis.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">CSV (placeholder)</span>
            </div>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Export system logs</div>
              <div className="aura-control-help">For diagnostics and audit trail.</div>
            </div>
            <div className="aura-control-right">
              <span className="aura-select-pill">JSON (placeholder)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Coming soon */}
      <section className="aura-card">
        <div className="aura-card-title">Coming Soon</div>
        <p className="aura-muted aura-text-xs aura-mt-10">
          Broker connection wizard, notification channels (email/SMS/push), advanced caps, and
          account-level audit controls.
        </p>
      </section>
    </div>
  );
}
