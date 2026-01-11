export const dynamic = "force-dynamic";

import { currentUser } from "@clerk/nextjs/server";

export default async function AppHome() {
  const user = await currentUser();

  // If middleware is working, this should never be null,
  // but leaving this makes it more robust.
  if (!user) return null;

  return (
    <main style={{ padding: 24 }}>
      <h1>Welcome to Aura</h1>
      <p>Clerk userId: {user.id}</p>
      <p>Email: {user.emailAddresses?.[0]?.emailAddress ?? "n/a"}</p>
    </main>
  );
}
