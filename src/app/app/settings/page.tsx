export const dynamic = "force-dynamic";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <h1 className="aura-page-title">Settings</h1>
        <p className="aura-page-subtitle">
          Manage broker connections, notifications, safety caps, and account preferences.
        </p>
      </div>

      {/* Read-only / UI-only notice */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <span className="aura-card-title">UI only</span>
          <span className="aura-muted aura-text-xs">Not wired yet</span>
        </div>
        <p className="aura-muted aura-text-xs aura-mt-6">
          These settings are placeholders for now. Strategy configuration lives in{" "}
          <Link className="aura-link aura-pill" href="/app/strategy">
            Strategy
          </Link>{" "}
          and live controls + charts live in{" "}
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

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Connected Broker</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Connection Status</span>
            <span className="aura-muted">Disconnected (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Environment</span>
            <span className="aura-muted">Demo / Live (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Connect / Manage</span>
            <span className="aura-muted">Coming soon</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Broker connections control where Aura can place orders. Strategy settings cannot override
            broker-level restrictions.
          </p>
        </div>
      </section>

      {/* Default account */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Account Defaults</div>
          <div className="aura-muted aura-text-xs">Applies across Aura</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Default Broker Account</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Default Symbol</span>
            <span className="aura-muted">MGC (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Default Session</span>
            <span className="aura-muted">New York (placeholder)</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Defaults are used when Aura starts running and no override has been selected in Live
            Control.
          </p>
        </div>
      </section>

      {/* Notifications */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Notifications</div>
          <div className="aura-muted aura-text-xs">Awareness without noise</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Trade opened</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Trade closed</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Paused / resumed</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Kill switch activated</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>System errors</span>
            <span className="aura-muted">—</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Notifications are designed to keep you informed without requiring constant monitoring.
          </p>
        </div>
      </section>

      {/* Safety caps (account-level overrides) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Safety Caps</div>
          <div className="aura-muted aura-text-xs">Hard limits</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Max daily loss (hard cap)</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Max weekly loss (hard cap)</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Max open risk at once</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Max consecutive losses</span>
            <span className="aura-muted">—</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Safety caps override strategy-level settings. If a cap is reached, Aura will pause and
            require manual intervention in Live Control.
          </p>
        </div>
      </section>

      {/* Preferences */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Preferences</div>
          <div className="aura-muted aura-text-xs">Personalise your view</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Timezone</span>
            <span className="aura-muted">Europe/London (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Currency display</span>
            <span className="aura-muted">GBP (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Session labels</span>
            <span className="aura-muted">Asian / London / New York</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Theme</span>
            <span className="aura-muted">Use Profile toggle</span>
          </div>

          <p className="aura-muted aura-text-xs">
            These settings affect how Aura presents information, not how trades are executed.
          </p>
        </div>
      </section>

      {/* Data & exports */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Data & Export</div>
          <div className="aura-muted aura-text-xs">Portability</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Export trades</span>
            <span className="aura-muted">CSV (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Export system logs</span>
            <span className="aura-muted">JSON (placeholder)</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Export is intended for journaling, tax prep, and external analysis tools.
          </p>
        </div>
      </section>

      {/* Security */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Security</div>
          <div className="aura-muted aura-text-xs">Account protection</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Two-factor authentication</span>
            <span className="aura-muted">Managed by Clerk (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Active sessions</span>
            <span className="aura-muted">Coming soon</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Aura will provide additional security tools over time, including session visibility and
            login alerts.
          </p>
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
