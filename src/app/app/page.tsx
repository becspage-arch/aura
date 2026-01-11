export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";
import { ensureUserProfile } from "@/src/lib/user-profile"; // adjust if needed

export default async function AppHome() {
  const user = await currentUser();
  if (!user) return null;

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
    <main style={{ padding: 24 }}>
      <h1>Welcome to Aura</h1>
      <p>Clerk userId: {user.id}</p>
      <p>UserProfile synced ✅</p>
    </main>
  );
}
