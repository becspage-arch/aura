// src/app/app/account/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { PushStatusRow } from "@/components/PushStatusRow";
import { TestEmailButton } from "@/components/TestEmailButton";
import { NotificationPreferences } from "@/components/NotificationPreferences";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <p className="aura-page-subtitle">
          Manage broker connections, notifications, safety caps, copy trading, and account preferences. Note your Strategy rules live in{" "}
          <Link href="/app/strategy-setup" className="aura-link aura-pill">
            Strategy
          </Link>
          . Your Live execution and charts live in{" "}
          <Link href="/app/live-trading" className="aura-link aura-pill">
            Live Control
          </Link>
          .
        </p>
      </div>

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
                Used if Live Control hasnâ€™t selected an account.
              </div>
            </div>
            <span className="aura-select-pill">â€”</span>
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
          <div className="aura-muted aura-text-xs">
            Choose what you want to hear about, then where Aura should send it
          </div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12">
          {/* What */}
          <div>
            <div className="aura-control-title">What to notify you about</div>
            <div className="aura-control-help">
              Pick the notifications you want. (Weâ€™ll wire these to saved preferences next.)
            </div>

            <NotificationPreferences />

          </div>

          <div className="aura-divider" />

          {/* Channels */}
          <div>
            <div className="aura-control-title">Channels</div>
            <div className="aura-control-help">
              Choose where Aura should send notifications.
            </div>

            <div className="aura-mt-12 aura-grid-gap-12">
              {/* In-app */}
              <div className="aura-card-muted aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-control-title">In-app (browser)</div>
                  <div className="aura-control-help">
                    Pop-up messages while Aura is open. No setup needed.
                  </div>
                </div>
                <span className="aura-select-pill">On</span>
              </div>

              {/* Phone push */}
              <div className="aura-card-muted aura-grid-gap-12">
                <div className="aura-control-meta">
                  <div className="aura-control-title">Phone push</div>
                  <div className="aura-control-help">
                    Lock-screen notifications on iPhone + Android (requires enabling).
                  </div>
                </div>

                <div className="aura-card-muted aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-control-title">Phone notifications</div>
                    <div className="aura-control-help">
                      Open the dedicated page to enable push inside the installed Aura app.
                    </div>
                  </div>

                  <div className="aura-control-right">
                    <PushStatusRow />
                    <Link href="/app/push" className="aura-btn">
                      Open
                    </Link>
                  </div>
                </div>
              </div>

              {/* Email */}
              <div className="aura-card-muted aura-grid-gap-12">
                <div className="aura-control-meta">
                  <div className="aura-control-title">Email</div>
                  <div className="aura-control-help">
                    Test sending now. (Weâ€™ll add preferences + daily/session summaries next.)
                  </div>
                </div>

                <TestEmailButton />
              </div>
            </div>
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
            <span className="aura-select-pill">USD</span>
          </div>
        </div>
      </section>
    </div>
  );
}

