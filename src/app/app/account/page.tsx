// src/app/app/account/page.tsx
export const dynamic = "force-dynamic";

import { BrokerConnectionsCard } from "@/components/BrokerConnectionsCard";
import { AccountNotificationsCard } from "./_components/AccountNotificationsCard";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Broker Connections */}
      <BrokerConnectionsCard />

      {/* Notifications (client) */}
      <AccountNotificationsCard />

      {/* Preferences */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Preferences</div>
          <div className="aura-muted aura-text-xs">Display &amp; behaviour</div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12 aura-disabled">
          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Timezone</div>
              <div className="aura-control-help">Defaults to Europe/London. Other timezones coming.</div>
            </div>
            <span className="aura-select-pill">Europe/London</span>
          </div>

          <div className="aura-card-muted aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">Currency display</div>
              <div className="aura-control-help">Defaults to $ USD. Other currencies coming.</div>
            </div>
            <span className="aura-select-pill">USD</span>
          </div>
        </div>
      </section>
    </div>
  );
}
