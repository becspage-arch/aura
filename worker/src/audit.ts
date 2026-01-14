import { db } from "./db";

export async function logEvent(params: {
  level: "INFO" | "WARN" | "ERROR";
  type: string;
  message: string;
  data?: any;
  userId?: string | null;
  brokerAccountId?: string | null;
  orderId?: string | null;
}) {
  await db.eventLog.create({
    data: {
      level: params.level,
      type: params.type,
      message: params.message,
      data: params.data ?? undefined,
      userId: params.userId ?? null,
      brokerAccountId: params.brokerAccountId ?? null,
      orderId: params.orderId ?? null,
    },
  });
}
