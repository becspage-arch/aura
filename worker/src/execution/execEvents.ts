// worker/src/execution/execEvents.ts
import type { PrismaClient } from "@prisma/client";

export type ExecEventType =
  | "exec.requested"
  | "exec.intent_created"
  | "exec.broker_blocked"
  | "exec.duplicate_ignored"
  | "exec.entry_submitted"
  | "exec.brackets_submitted"
  | "exec.oco_watch_started"
  | "exec.failed";

export async function emitExecEvent(params: {
  prisma: PrismaClient;

  // internal UserProfile.id
  userId: string;

  // broker account scope (BrokerAccount.id)
  brokerAccountId?: string | null;

  executionId?: string | null;
  type: ExecEventType;
  message: string;
  data?: any;
  level?: "info" | "warn" | "error";
}) {
  const { prisma } = params;
  const level = params.level ?? "info";

  console.log(`[exec-event] ${params.type}`, {
    level,
    userId: params.userId,
    brokerAccountId: params.brokerAccountId ?? null,
    executionId: params.executionId ?? null,
    message: params.message,
    data: params.data ?? null,
  });

  await prisma.eventLog.create({
    data: {
      type: params.type,
      level,
      message: params.message,
      data: {
        brokerAccountId: params.brokerAccountId ?? null,
        executionId: params.executionId ?? null,
        ...(params.data ?? {}),
      },
      userId: params.userId,
      brokerAccountId: params.brokerAccountId ?? null,
    },
  });
}
