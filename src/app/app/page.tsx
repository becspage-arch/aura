export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/lib/user-profile";
import RealtimeTimeline from "@/components/realtime/RealtimeTimeline";

export default async function AppHome() {
  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses?.[0]?.emailAddress ?? null;
  const displayName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user.username ?? null;

  // Ensure UserProfile exists / is synced
  await ensureUserProfile({
    clerkUserId: user.id,
    email,
    displayName,
  });

  return (
    <main style={{ padding: 24 }}>
      <h1>Welcome to Aura</h1>

      <p>Clerk userId: {user.id}</p>
      <p>UserProfile synced ✅</p>

      <hr style={{ margin: "24px 0" }} />

      {/* Realtime Ably events */}
      <RealtimeTimeline clerkUserId={user.id} />
    </main>
  );
}
