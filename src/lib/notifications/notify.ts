// src/lib/notifications/notify.ts

import type { PrismaClient } from "@prisma/client";
import type { NotificationEvent } from "./events";
import { notificationIdempotencyKey } from "./events";
import { publishInAppNotification } from "./inApp";

type NotifyDeps = {
  prisma: PrismaClient;
};

/**
 * notify(event)
 * - Dedupes via NotificationLog.key (unique)
 * - Then fans out (we'll add the real sends in later steps)
 */
export async function notify(event: NotificationEvent, deps: NotifyDeps) {
  const { prisma } = deps;

  const key = notificationIdempotencyKey(event);

  const created = await tryCreateNotificationLog({
    prisma,
    userId: event.userId,
    key,
    type: event.type,
  });

  if (!created) {
    // Duplicate (already notified) - do nothing.
    return { ok: true as const, skipped: true as const, key };
  }

if (event.type === "trade_closed") {
  const pnl = event.realisedPnlUsd;
  const sign = pnl > 0 ? "+" : "";
  const title = "Aura - Trade Closed";
  const body =
    event.result === "win"
      ? `🟢 WIN ${sign}$${Math.abs(pnl).toFixed(0)} on ${event.symbol}`
      : event.result === "loss"
      ? `🔴 LOSS -$${Math.abs(pnl).toFixed(0)} on ${event.symbol}`
      : `⚪️ BREAKEVEN $0 on ${event.symbol}`;

  await publishInAppNotification(event.userId, {
    type: "trade_closed",
    title,
    body,
    ts: event.ts,
    deepLink: `/app/trades/${event.tradeId}`,
  });
}

  return { ok: true as const, skipped: false as const, key };
}

async function tryCreateNotificationLog(args: {
  prisma: PrismaClient;
  userId: string;
  key: string;
  type: string;
}) {
  try {
    await args.prisma.notificationLog.create({
      data: {
        userId: args.userId,
        key: args.key,
        type: args.type,
      },
    });
    return true;
  } catch (err: any) {
    // Prisma unique constraint error (P2002) means we've already sent it.
    if (err?.code === "P2002") return false;
    throw err;
  }
}
