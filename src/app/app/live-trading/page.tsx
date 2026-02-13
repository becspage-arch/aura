export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import { LiveControlSwitches } from "@/components/live-control/LiveControlSwitches";
import { StrategyConfigSummaryCard } from "@/components/live-control/StrategyConfigSummaryCard";

export default async function LiveControlPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl aura-page">
        <div>
          <h1 className="aura-page-title">Live Trading</h1>
          <p className="aura-page-subtitle">
            Sign in to control Aura and manage live execution.
          </p>
        </div>

        <section className="aura-card">
          <div className="aura-card-title">Not signed in</div>
          <p className="aura-muted aura-text-xs aura-mt-10">
            Please sign in to access Live Trading.
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

  return (
    <div className="mx-auto max-w-6xl aura-page">
      <div>
        <h1 className="aura-page-title">Live Trading</h1>
        <p className="aura-page-subtitle">
          Start or pause Aura, and use Emergency Stop to prevent new trades.
          Charts and trade review live in the Charts and Reports tabs.
        </p>
      </div>

      {/* Controls FIRST */}
      <LiveControlSwitches />

      {/* Compact, read-only summary BELOW controls */}
      <StrategyConfigSummaryCard />
    </div>
  );
}
