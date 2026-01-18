import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      <div className="aura-row-between">
        <div>
          <p className="aura-page-subtitle">Personal preferences and account overview.</p>
        </div>

        <Link href="/app/settings" className="aura-btn aura-btn-subtle">
          Open Settings
        </Link>
      </div>

      {/* Identity */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Identity</div>
          <div className="aura-muted aura-text-xs">Read-only</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Name</div>
              <div className="aura-control-help">Managed by your sign-in provider.</div>
            </div>
            <span className="aura-select-pill">—</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Email</div>
              <div className="aura-control-help">Used for alerts and account access.</div>
            </div>
            <span className="aura-select-pill">—</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Authentication</div>
              <div className="aura-control-help">Your sign-in provider.</div>
            </div>
            <span className="aura-select-pill">Clerk (placeholder)</span>
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Appearance</div>
          <div className="aura-muted aura-text-xs">Theme</div>
        </div>

        <div className="aura-mt-12">
          <ThemeToggle />
          <p className="aura-muted aura-text-xs aura-mt-10">
            Dark mode is the default. You can switch to light mode anytime.
          </p>
        </div>
      </section>

      {/* Locale & Time */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Locale & Time</div>
          <div className="aura-muted aura-text-xs">Display preferences</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Timezone</div>
              <div className="aura-control-help">Used for timestamps and session labels in the UI.</div>
            </div>
            <span className="aura-select-pill">Europe/London (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Date format</div>
              <div className="aura-control-help">How dates are displayed across Aura.</div>
            </div>
            <span className="aura-select-pill">DD/MM/YYYY (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Currency display</div>
              <div className="aura-control-help">Formatting only (does not affect execution).</div>
            </div>
            <span className="aura-select-pill">GBP (placeholder)</span>
          </div>
        </div>
      </section>

      {/* Notifications destination */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Notifications</div>
          <div className="aura-muted aura-text-xs">Delivery</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Primary email</div>
              <div className="aura-control-help">Where alerts are delivered (rules set in Settings).</div>
            </div>
            <span className="aura-select-pill">—</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Push notifications</div>
              <div className="aura-control-help">Enable later for mobile alerts.</div>
            </div>
            <div className="aura-toggle" aria-label="Push notifications (disabled)" />
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Preferred channel</div>
              <div className="aura-control-help">Email / Push / SMS (future).</div>
            </div>
            <span className="aura-select-pill">Email (placeholder)</span>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Notification rules (what triggers alerts) live in Settings. This section controls where they go.
        </p>
      </section>

      {/* Security */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Security</div>
          <div className="aura-muted aura-text-xs">Read-only</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Two-factor authentication</div>
              <div className="aura-control-help">Managed by your sign-in provider.</div>
            </div>
            <span className="aura-select-pill">Unknown (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Last sign-in</div>
              <div className="aura-control-help">Recent account activity.</div>
            </div>
            <span className="aura-select-pill">—</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Active sessions</div>
              <div className="aura-control-help">View and revoke sessions (future).</div>
            </div>
            <span className="aura-select-pill">Coming soon</span>
          </div>
        </div>
      </section>

      {/* Account */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Account</div>
          <div className="aura-muted aura-text-xs">Access & plan</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Plan</div>
              <div className="aura-control-help">Controls access to features and limits.</div>
            </div>
            <span className="aura-select-pill">Founder (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Feature access</div>
              <div className="aura-control-help">Enabled modules for this account.</div>
            </div>
            <span className="aura-select-pill">CorePlus 315 (placeholder)</span>
          </div>
        </div>
      </section>
    </div>
  );
}
