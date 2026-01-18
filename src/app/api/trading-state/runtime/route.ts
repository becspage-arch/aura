// src/app/api/trading-state/runtime/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const state = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, isPaused: false, isKillSwitched: false },
  });

  const isPaused = !!state.isPaused;
  const isKillSwitched = !!state.isKillSwitched;

  // UI definition (for now):
  // "Trading / Running" means Aura is NOT paused and NOT kill-switched.
  const isTrading = !isPaused && !isKillSwitched;

  return Response.json({
    ok: true,
    isTrading,
    isPaused,
    isKillSwitched,
  });
}
