// src/app/app/page.tsx
export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import DashboardView from "@/components/dashboard/DashboardView";

export default async function AppHome() {
  const user = await currentUser();

  // App routes should already be protected by Clerk middleware,
  // but keep this guard to avoid hard crashes.
  if (!user) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto mt-10 max-w-3xl">
          <h1 className="text-2xl font-semibold">Aura</h1>
          <p className="mt-2 aura-muted">Please sign in to view your dashboard.</p>
        </div>
      </main>
    );
  }

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
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 pb-10">
        <DashboardView clerkUserId={user.id} />
      </div>
    </div>
  );
}
