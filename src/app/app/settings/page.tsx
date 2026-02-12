// src/app/app/settings/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { PushStatusRow } from "@/components/PushStatusRow";
import { TestEmailButton } from "@/components/TestEmailButton";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <p className="aura-page-subtitle">
          Manage broker connections, notifications, safety caps, copy trading, and account preferences. Note your Strategy rules live in{" "}
          <Link href="/app/strategy" className="aura-link aura-pill">
            Strategy
          </Link>
          . Your Live execution and charts live in{" "}
          <Link href="/app/live-control" className="aura-link aura-pill">
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
          <div className="aura-muted aura-text-xs">
            Choose what you want to hear about, then where Aura should send it
          </div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12">
          {/* What */}
          <div>
            <div className="aura-control-title">What to notify you about</div>
            <div className="aura-control-help">
              Pick the notifications you want. (We’ll wire these to saved preferences next.)
            </div>

            <NotificationPreferencesPanel />

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
                    Test sending now. (We’ll add preferences + daily/session summaries next.)
                  </div>
                </div>

                <TestEmailButton />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Safety Caps */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Daily Limits</div>
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
              <div className="aura-control-title">Max daily profit</div>
              <div className="aura-control-help">
                Aura pauses automatically if reached.
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
            <span className="aura-select-pill">USD</span>
          </div>
        </div>
      </section>
    </div>
  );
}
