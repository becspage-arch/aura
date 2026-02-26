// src/app/api/system/status/route.ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const HEARTBEAT_OK_MS = 120_000;

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const user = await prisma.userProfile.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user) {
    return Response.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  const accounts = await prisma.brokerAccount.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      brokerName: true,
      isEnabled: true,
      isPaused: true,
      isKillSwitched: true,
      lastHeartbeatAt: true,
      workerLease: {
        select: {
          status: true,
          lastSeenAt: true,
          instanceId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();

  const result = accounts.map((a) => {
    const hbMs = a.lastHeartbeatAt?.getTime() ?? null;
    const heartbeatHealthy =
      hbMs != null && now - hbMs <= HEARTBEAT_OK_MS;

    const leaseRunning = a.workerLease?.status === "RUNNING";

    const workerHealthy = heartbeatHealthy && leaseRunning;

    const systemRunning =
      a.isEnabled &&
      !a.isPaused &&
      !a.isKillSwitched &&
      workerHealthy;

    return {
      brokerAccountId: a.id,
      brokerName: a.brokerName,
      isEnabled: a.isEnabled,
      isPaused: a.isPaused,
      isKillSwitched: a.isKillSwitched,
      workerLeaseStatus: a.workerLease?.status ?? "STOPPED",
      heartbeatHealthy,
      workerHealthy,
      systemRunning,
      lastHeartbeatAt: a.lastHeartbeatAt?.toISOString() ?? null,
    };
  });

  return Response.json({
    ok: true,
    accounts: result,
  });
}
