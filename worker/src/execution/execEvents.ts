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
  userId: string;
  executionId?: string | null;
  type: ExecEventType;
  message: string;
  data?: any;
  level?: "info" | "warn" | "error";
}) {
  const { prisma } = params;
  const level = params.level ?? "info";

  // CloudWatch / logs
  console.log(`[exec-event] ${params.type}`, {
    level,
    userId: params.userId,
    executionId: params.executionId ?? null,
    message: params.message,
    data: params.data ?? null,
  });

  // Persist
  await prisma.eventLog.create({
    data: {
      type: params.type,
      level,
      message: params.message,
      data: {
        executionId: params.executionId ?? null,
        ...(params.data ?? {}),
      },
      userId: params.userId,
    },
  });
}
