// src/lib/notifications/notify.ts

import type { PrismaClient } from "@prisma/client";
import type { NotificationEvent } from "./events";
import { notificationIdempotencyKey } from "./events";
import { publishInAppNotification } from "./inApp";
import { sendPushTradeClosed } from "./push";
import { sendEmail } from "./email";
import { renderAuraEmail } from "./emailTemplate";

type NotifyDeps = {
  prisma: PrismaClient;
};

async function getUserEmailByClerkUserId(prisma: PrismaClient, clerkUserId: string) {
  const user = await prisma.userProfile.findUnique({
    where: { clerkUserId },
    select: { email: true },
  });
  return user?.email ?? null;
}

async function getNotificationPrefs(prisma: PrismaClient, clerkUserId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!profile) return null;

  return prisma.notificationPreferences.upsert({
    where: { userId: profile.id },
    update: {},
    create: {
      userId: profile.id,
      tradeClosedWins: true,
      tradeClosedLosses: true,
      dailySummary: false,
      strategyStatus: true,
    },
    select: {
      tradeClosedWins: true,
      tradeClosedLosses: true,
      dailySummary: true,
      strategyStatus: true,
    },
  });
}

function fmtMoney(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtMoneyNoCents(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(0)}`;
}

function fmtPrice(v: number) {
  return Number.isFinite(v) ? v.toFixed(2) : "—";
}

function londonStamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London" }) + " (UK)";
}

/**
 * notify(event)
 * - Dedupes via NotificationLog.key (unique)
 * - Fans out to the appropriate channels
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

  // -----------------------------
  // Trade closed → In-app + Push + Email (polished)
  // -----------------------------
  if (event.type === "trade_closed") {
    const prefs = await getNotificationPrefs(prisma, event.userId);
    if (prefs) {
      const isWin = event.result === "win";
      const isLoss = event.result === "loss";

      if (isWin && !prefs.tradeClosedWins) return { ok: true as const, skipped: true as const, key };
      if (isLoss && !prefs.tradeClosedLosses) return { ok: true as const, skipped: true as const, key };
    }

    const pnl = event.realisedPnlUsd;
    const sign0 = pnl > 0 ? "+" : "";
    const title = "Aura - Trade Closed";

    const body =
      event.result === "win"
        ? `🟢 WIN ${sign0}$${Math.abs(pnl).toFixed(0)} on ${event.symbol}`
        : event.result === "loss"
        ? `🔴 LOSS -$${Math.abs(pnl).toFixed(0)} on ${event.symbol}`
        : `⚪️ BREAKEVEN $0 on ${event.symbol}`;

    await publishInAppNotification(event.userId, {
      type: "trade_closed",
      title,
      body,
      ts: event.ts,
      deepLink: `/app/reports/${event.tradeId}`,
    });

    await sendPushTradeClosed(event, { prisma });

    const toEmail = await getUserEmailByClerkUserId(prisma, event.userId);
    if (toEmail) {
      const trade = await prisma.trade.findUnique({
        where: { id: event.tradeId },
        select: {
          id: true,
          symbol: true,
          side: true,
          qty: true,
          openedAt: true,
          closedAt: true,
          entryPriceAvg: true,
          exitPriceAvg: true,
          realizedPnlUsd: true,
          outcome: true,
        },
      });

      const appOrigin = "https://tradeaura.net";
      const viewUrl = `${appOrigin}/app/reports/${event.tradeId}`;

      const pnlUsd = Number(
        (trade?.realizedPnlUsd as any)?.toNumber?.() ??
          trade?.realizedPnlUsd ??
          event.realisedPnlUsd
      );

      const isWin = event.result === "win";
      const isLoss = event.result === "loss";

      const badgeText = isWin ? "WIN" : isLoss ? "LOSS" : "BREAKEVEN";
      const badgeTone = isWin ? "win" : isLoss ? "loss" : "neutral";

      const symbol = trade?.symbol ?? event.symbol;

      const side = (trade?.side ?? "").toString().toUpperCase();
      const direction = side === "SELL" ? "Short" : "Long";

      const qty = Number((trade?.qty as any)?.toNumber?.() ?? trade?.qty ?? 0);

      const entryPx = Number((trade?.entryPriceAvg as any)?.toNumber?.() ?? trade?.entryPriceAvg ?? NaN);
      const exitPx = Number((trade?.exitPriceAvg as any)?.toNumber?.() ?? trade?.exitPriceAvg ?? NaN);

      const closedAtIso =
        trade?.closedAt?.toISOString?.() ??
        event.exitTs ??
        event.ts ??
        new Date().toISOString();

      const openedAtIso =
        trade?.openedAt?.toISOString?.() ??
        event.entryTs ??
        event.ts ??
        new Date().toISOString();

      const subject = `Aura – ${badgeText} on ${symbol} • ${fmtMoneyNoCents(pnlUsd)}`;

      const html = renderAuraEmail({
        preheader: `Aura trade closed: ${badgeText} ${fmtMoneyNoCents(pnlUsd)} on ${symbol}.`,
        headerKickerLeft: "Aura",
        headerKickerRight: "Trade Closed",
        headerSubline: londonStamp(closedAtIso),

        badgeText,
        badgeTone,
        topRightText: fmtMoney(pnlUsd),

        title: `${direction} ${qty ? `${qty}x ` : ""}${symbol}`,
        subtitle: `Entry ${fmtPrice(entryPx)} • Exit ${fmtPrice(exitPx)}`,

        rows: [
          { label: "Opened", value: londonStamp(openedAtIso) },
          { label: "Closed", value: londonStamp(closedAtIso) },
          { label: "Outcome", value: badgeText },
          { label: "PnL", value: fmtMoney(pnlUsd) },
        ],

        cta: {
          label: "View trade",
          href: viewUrl,
          hintRight: `Trade ID: ${event.tradeId}`,
        },

        footerLine1:
          "You’re receiving this because trade notifications are enabled for your Aura account.",
      });

      await sendEmail({ to: toEmail, subject, html });
    }
  }

  // -----------------------------
  // Trade opened → In-app only
  // -----------------------------
  if (event.type === "trade_opened") {
    const dir = event.direction === "long" ? "🟦 ENTERED LONG" : "🟥 ENTERED SHORT";
    const px = typeof event.entryPrice === "number" ? ` @ ${event.entryPrice}` : "";

    const title = "Aura - Trade Opened";
    const body = `${dir} ${event.size}x ${event.symbol}${px}`;

    await publishInAppNotification(event.userId, {
      type: "trade_opened",
      title,
      body,
      ts: event.ts,
      deepLink: `/app/reports/${event.tradeId}`,
    });
  }

  // -----------------------------
  // Strategy status changed → In-app + Email (optional)
  // -----------------------------
  if (event.type === "strategy_status_changed") {
    const prefs = await getNotificationPrefs(prisma, event.userId);
    if (prefs && !prefs.strategyStatus) return { ok: true as const, skipped: true as const, key };

    const isPaused = !!(event as any).isPaused;
    const isKillSwitched = !!(event as any).isKillSwitched;

    const title = "Aura - Strategy Status";
    const body = isKillSwitched
      ? "⛔ EMERGENCY STOP enabled"
      : isPaused
      ? "❚❚ Aura paused"
      : "▶ Aura running";

    await publishInAppNotification(event.userId, {
      type: "strategy_status",
      title,
      body,
      ts: event.ts,
      deepLink: "/app/live-trading",
    });

    const toEmail = await getUserEmailByClerkUserId(prisma, event.userId);
    if (toEmail) {
      const appOrigin = "https://tradeaura.net";
      const subject = `Aura – ${isKillSwitched ? "Emergency Stop" : isPaused ? "Paused" : "Running"}`;

      const html = renderAuraEmail({
        preheader: body,
        headerKickerLeft: "Aura",
        headerKickerRight: "Status",
        headerSubline: londonStamp(event.ts),

        badgeText: isKillSwitched ? "STOP" : isPaused ? "PAUSED" : "RUNNING",
        badgeTone: isKillSwitched ? "loss" : isPaused ? "neutral" : "win",
        topRightText: "",

        title: "Strategy status updated",
        subtitle: body,

        rows: [
          { label: "Status", value: isKillSwitched ? "EMERGENCY STOP" : isPaused ? "PAUSED" : "RUNNING" },
          { label: "Time", value: londonStamp(event.ts) },
        ],

        cta: {
          label: "Open Live Trading",
          href: `${appOrigin}/app/live-trading`,
          hintRight: "",
        },

        footerLine1:
          "You’re receiving this because strategy status notifications are enabled for your Aura account.",
      });

      await sendEmail({ to: toEmail, subject, html });
    }
  }

  // -----------------------------
  // Session summary → Email (later - emitted from worker)
  // -----------------------------
  if (event.type === "session_summary") {
    // v1: handled by sendEmailSessionSummary in src/lib/notifications/email.ts
    // and called by worker emitDailySummary. Nothing to do here right now.
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
    if (err?.code === "P2002") return false;
    throw err;
  }
}
