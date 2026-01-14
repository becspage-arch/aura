import { db } from "./db";

export async function getSafetyStateForUser(clerkUserId: string) {
  const user = await db.userProfile.findUnique({
    where: { clerkUserId },
    include: { userState: true },
  });

  if (!user) return { allow: false as const, reason: "user_not_found" };
  const st = user.userState;

  if (!st) return { allow: false as const, reason: "user_state_missing" };
  if (st.isKillSwitched) return { allow: false as const, reason: "kill_switch" };
  if (st.isPaused) return { allow: false as const, reason: "paused" };

  return { allow: true as const, userId: user.id, state: st };
}
