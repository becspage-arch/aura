import { db } from "@/lib/db";

export async function writeAuditLog(userProfileId: string, action: string, data?: any) {
  await db.auditLog.create({
    data: { userId: userProfileId, action, data: data ?? undefined },
  });
}

export async function writeEventLog(params: {
  type: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: any;
  userId?: string;
  brokerAccountId?: string;
  orderId?: string;
}) {
  await db.eventLog.create({
    data: {
      type: params.type,
      level: params.level,
      message: params.message,
      data: params.data ?? undefined,
      userId: params.userId,
      brokerAccountId: params.brokerAccountId,
      orderId: params.orderId,
    },
  });
}
