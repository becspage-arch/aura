// worker/src/scope/workerScope.ts
import type { PrismaClient } from "@prisma/client";

export type WorkerScope = {
  clerkUserId: string;
  userId: string; // internal UserProfile.id
  brokerAccountId: string;
  brokerName: string;
  externalId: string | null;
};

export async function getWorkerScope(params: {
  prisma: PrismaClient;
  env: NodeJS.ProcessEnv;
  workerName: string;
}): Promise<WorkerScope> {
  const clerkUserId = (params.env.AURA_CLERK_USER_ID || "").trim();
  if (!clerkUserId) {
    throw new Error(`[${params.workerName}] Missing AURA_CLERK_USER_ID`);
  }

  const brokerAccountId = (params.env.AURA_BROKER_ACCOUNT_ID || "").trim();
  if (!brokerAccountId) {
    throw new Error(`[${params.workerName}] Missing AURA_BROKER_ACCOUNT_ID`);
  }

  const user = await params.prisma.userProfile.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user?.id) {
    throw new Error(
      `[${params.workerName}] No userProfile found for clerkUserId=${clerkUserId}`
    );
  }

  const acct = await params.prisma.brokerAccount.findFirst({
    where: { id: brokerAccountId, userId: user.id },
    select: { id: true, brokerName: true, externalId: true },
  });

  if (!acct) {
    throw new Error(
      `[${params.workerName}] BrokerAccount not found or not owned by user. brokerAccountId=${brokerAccountId}`
    );
  }

  if (!acct.brokerName) {
    throw new Error(
      `[${params.workerName}] BrokerAccount.brokerName missing for brokerAccountId=${brokerAccountId}`
    );
  }

  return {
    clerkUserId,
    userId: user.id,
    brokerAccountId: acct.id,
    brokerName: acct.brokerName,
    externalId: acct.externalId ?? null,
  };
}
