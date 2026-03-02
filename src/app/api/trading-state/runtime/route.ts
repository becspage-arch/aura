// src/app/api/trading-state/runtime/route.ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const HEARTBEAT_OK_MS = 120_000;

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await prisma.userProfile.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user) return new Response("User profile not found", { status: 404 });

  const accounts = await prisma.brokerAccount.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      isEnabled: true,
      isPaused: true,
      isKillSwitched: true,
      lastHeartbeatAt: true,
      workerLease: { select: { status: true } },
    },
  });

  const now = Date.now();

  const anyRunning = accounts.some((a) => {
    const hbMs = a.lastHeartbeatAt?.getTime() ?? null;
    const heartbeatHealthy = hbMs != null && now - hbMs <= HEARTBEAT_OK_MS;
    const leaseRunning = a.workerLease?.status === "RUNNING";
    const workerHealthy = heartbeatHealthy && leaseRunning;

    const systemRunning =
      a.isEnabled &&
      !a.isPaused &&
      !a.isKillSwitched &&
      workerHealthy;

    return systemRunning;
  });

  // For Strategy Setup UI purposes:
  // - "Trading" means at least one enabled account is actively running (worker healthy etc.)
  // - "Paused" means nothing is running
  // - Kill switch is not a single global flag anymore, so we only surface it if it explains "not running"
  const anyKillSwitched = accounts.some((a) => a.isEnabled && a.isKillSwitched);

  const isTrading = anyRunning;
  const isPaused = !anyRunning;
  const isKillSwitched = !anyRunning && anyKillSwitched;

  return Response.json({
    ok: true,
    isTrading,
    isPaused,
    isKillSwitched,
  });
}
