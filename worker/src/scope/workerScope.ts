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
  const brokerAccountId = (params.env.AURA_BROKER_ACCOUNT_ID || "").trim();
  if (!brokerAccountId) {
    throw new Error(`[${params.workerName}] Missing AURA_BROKER_ACCOUNT_ID`);
  }

  const acct = await params.prisma.brokerAccount.findUnique({
    where: { id: brokerAccountId },
    select: {
      id: true,
      brokerName: true,
      externalId: true,
      user: {
        select: {
          id: true,
          clerkUserId: true,
        },
      },
    },
  });

  if (!acct) {
    throw new Error(
      `[${params.workerName}] BrokerAccount not found. brokerAccountId=${brokerAccountId}`
    );
  }

  if (!acct.user?.id) {
    throw new Error(
      `[${params.workerName}] BrokerAccount has no owning user. brokerAccountId=${brokerAccountId}`
    );
  }

  const clerkUserId = (acct.user.clerkUserId || "").trim();
  if (!clerkUserId) {
    throw new Error(
      `[${params.workerName}] UserProfile.clerkUserId missing for brokerAccountId=${brokerAccountId}`
    );
  }

  if (!acct.brokerName) {
    throw new Error(
      `[${params.workerName}] BrokerAccount.brokerName missing for brokerAccountId=${brokerAccountId}`
    );
  }

  return {
    clerkUserId,
    userId: acct.user.id,
    brokerAccountId: acct.id,
    brokerName: acct.brokerName,
    externalId: acct.externalId ?? null,
  };
}
