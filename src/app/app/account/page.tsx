// src/app/app/account/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { PushStatusRow } from "@/components/PushStatusRow";
import { TestEmailButton } from "@/components/TestEmailButton";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { BrokerConnectionsCard } from "@/components/BrokerConnectionsCard";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">

      {/* Broker Connections (NOW REAL) */}
      <BrokerConnectionsCard />

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
              <div className="aura-control-help">Used if Live Control hasn’t selected an account.</div>
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
          <div>
            <div className="aura-control-title">What to notify you about</div>
            <div className="aura-control-help">
              Pick the notifications you want. (We’ll wire these to saved preferences next.)
            </div>

            <NotificationPreferences />
          </div>

          <div className="aura-divider" />

          <div>
            <div className="aura-control-title">Channels</div>
            <div className="aura-control-help">Choose where Aura should send notifications.</div>

            <div className="aura-mt-12 aura-grid-gap-12">
              <div className="aura-card-muted aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-control-title">In-app (browser)</div>
                  <div className="aura-control-help">Pop-up messages while Aura is open. No setup needed.</div>
                </div>
                <span className="aura-select-pill">On</span>
              </div>

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
              <div className="aura-control-help">Used for sessions, charts, and reporting.</div>
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
