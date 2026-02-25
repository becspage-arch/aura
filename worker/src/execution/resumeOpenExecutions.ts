// worker/src/execution/resumeOpenExecutions.ts

import type { PrismaClient } from "@prisma/client";
import type { IBrokerAdapter } from "../broker/IBrokerAdapter.js";

const RESUMABLE_STATUSES = [
  "INTENT_CREATED",
  "ORDER_SUBMITTED",
  "ORDER_ACCEPTED",
  "ORDER_FILLED",
  "BRACKET_SUBMITTED",
  "BRACKET_ACTIVE",
  "POSITION_OPEN",
] as const;

export async function resumeOpenExecutions(params: {
  prisma: PrismaClient;
  broker: IBrokerAdapter;
  userId: string;
  brokerAccountId: string;
}) {
  const { prisma, broker, userId, brokerAccountId } = params;

  console.log("[resume] scanning for open executions", {
    brokerAccountId,
  });

  const executions = await prisma.execution.findMany({
    where: {
      userId,
      brokerAccountId,
      status: { in: RESUMABLE_STATUSES as any },
    },
    orderBy: { updatedAt: "asc" },
  });

  if (!executions.length) {
    console.log("[resume] nothing to resume", { brokerAccountId });
    return;
  }

  console.log("[resume] found executions", {
    brokerAccountId,
    count: executions.length,
  });

  for (const exec of executions) {
    try {
      console.log("[resume] checking", {
        brokerAccountId,
        id: exec.id,
        execKey: exec.execKey,
        status: exec.status,
      });

      // 1️⃣ Check broker position
      let positionSize = 0;

      if (typeof (broker as any).getPosition === "function") {
        const pos = await (broker as any).getPosition({
          contractId: exec.contractId,
          symbol: exec.symbol ?? exec.contractId,
        });

        positionSize = Number(pos?.size ?? 0);
      }

      // 2️⃣ If broker flat → mark closed
      if (!positionSize) {
        await prisma.execution.update({
          where: { id: exec.id },
          data: {
            status: "POSITION_CLOSED",
            error: null,
          },
        });

        console.log("[resume] marked closed", {
          brokerAccountId,
          execKey: exec.execKey,
        });

        continue;
      }

      // 3️⃣ If broker has position → ensure correct open status
      await prisma.execution.update({
        where: { id: exec.id },
        data: {
          status: "POSITION_OPEN",
        },
      });

      console.log("[resume] marked open", {
        brokerAccountId,
        execKey: exec.execKey,
        positionSize,
      });

    } catch (e: any) {
      console.error("[resume] failed for execution", {
        brokerAccountId,
        execKey: exec.execKey,
        err: e?.message ?? String(e),
      });
    }
  }
}
