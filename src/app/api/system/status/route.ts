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
        accountLabel: true,
        externalId: true,
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

    if (accounts.length === 0) {
    return Response.json({ ok: true, accounts: [] });
    }

    const recentErrors = await prisma.eventLog.findMany({
    where: {
        brokerAccountId: { in: accounts.map((a) => a.id) },
        level: { in: ["error", "warn"] },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
        brokerAccountId: true,
        createdAt: true,
        type: true,
        level: true,
        message: true,
    },
    });

    const latestErrorByAccount = new Map<
    string,
    { createdAt: string; type: string; level: string; message: string }
    >();

    for (const e of recentErrors) {
    if (!e.brokerAccountId) continue;
    if (latestErrorByAccount.has(e.brokerAccountId)) continue;
    latestErrorByAccount.set(e.brokerAccountId, {
        createdAt: e.createdAt.toISOString(),
        type: e.type,
        level: e.level,
        message: e.message,
    });
    }

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
      accountLabel: a.accountLabel ?? null,
      externalId: a.externalId ?? null,
      latestError: latestErrorByAccount.get(a.id) ?? null
    };
  });

  return Response.json({
    ok: true,
    accounts: result,
  });
}
