// src/lib/notifications/push.ts
import type { PrismaClient } from "@prisma/client";
import type { TradeClosedEvent } from "./events";
import { sendApnsPush } from "@/lib/push/apns";

export async function sendPushTradeClosed(
  event: TradeClosedEvent,
  deps: { prisma: PrismaClient }
) {
  const { prisma } = deps;

  const devices = await prisma.apnsPushDevice.findMany({
    where: { userId: event.userId },
    select: { deviceToken: true, environment: true },
  });

  if (devices.length === 0) {
    return { ok: true as const, provider: "apns" as const, skipped: true as const };
  }

  const pnl = event.realisedPnlUsd;
  const sign = pnl > 0 ? "+" : "";
  const title = "Aura";
  const body =
    event.result === "win"
      ? `🟢 WIN ${sign}$${Math.abs(pnl).toFixed(0)} on ${event.symbol}`
      : event.result === "loss"
      ? `🔴 LOSS -$${Math.abs(pnl).toFixed(0)} on ${event.symbol}`
      : `⚪️ BREAKEVEN $0 on ${event.symbol}`;

  const results: any[] = [];

  for (const d of devices) {
    try {
      await sendApnsPush({
        env: d.environment === "sandbox" ? "sandbox" : "production",
        deviceToken: d.deviceToken,
        title,
        body,
        data: { kind: "trade_closed", tradeId: event.tradeId },
      });
      results.push({ ok: true });
    } catch (e: any) {
      results.push({ ok: false, error: e?.message ?? "UNKNOWN" });
    }
  }

  return { ok: true as const, provider: "apns" as const, results };
}
