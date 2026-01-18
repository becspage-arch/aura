export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { TradingChart } from "@/components/charts/TradingChart";
import { LiveControlSwitches } from "@/components/live-control/LiveControlSwitches";
import { RiskSettingsCard } from "@/components/live-control/RiskSettingsCard";

export default async function LiveControlPage() {
  const user = await currentUser();

  // Not signed in
  if (!user) {
    return (
      <div className="mx-auto max-w-6xl aura-page">
        <div>
          <h1 className="aura-page-title">Live Control</h1>
          <p className="aura-page-subtitle">
            Sign in to view live controls and monitoring.
          </p>
        </div>

        <section className="aura-card">
          <div className="aura-card-title">Not signed in</div>
          <p className="aura-muted aura-text-xs aura-mt-10">
            Please sign in to access Live Control.
          </p>
        </section>
      </div>
    );
  }

  // Keep profile creation (doesn’t affect trading plumbing, just keeps app consistent)
  const email = user.emailAddresses?.[0]?.emailAddress ?? null;
  const displayName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user.username ?? null;

  await ensureUserProfile({
    clerkUserId: user.id,
    email,
    displayName,
  });

  // Live Control should subscribe to the user channel for realtime events
  const channelName = `user:${user.id}`;

  // For now, keep symbol simple + safe (we can wire selection later)
  const symbol = "MGC";

  return (
    <div className="mx-auto max-w-6xl aura-page">
      <div>
        <h1 className="aura-page-title">Live Control</h1>
        <p className="aura-page-subtitle">
          Chart-first live monitoring. Controls live at the top.
        </p>
      </div>

      {/* Live controls FIRST (pills + actions only) */}
      <LiveControlSwitches />

      {/* Risk settings BELOW controls (single source of truth in UI) */}
      <RiskSettingsCard />

      {/* Live chart (already wired) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Live Chart</div>
          <div className="aura-muted aura-text-xs">
            Channel: {channelName} • Symbol: {symbol}
          </div>
        </div>

        <div className="aura-mt-12">
          <TradingChart
            symbol={symbol}
            initialTf="15s"
            channelName={channelName}
          />
        </div>
      </section>
    </div>
  );
}
