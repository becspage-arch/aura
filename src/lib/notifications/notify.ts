// src/lib/notifications/notify.ts

import type { PrismaClient } from "@prisma/client";
import type { NotificationEvent } from "./events";
import { notificationIdempotencyKey } from "./events";
import { publishInAppNotification } from "./inApp";
import { sendPushTradeClosed } from "./push";
import { sendEmail } from "./email";

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
    return { ok: true as const, skipped: true as const, key };
  }

  // -----------------------------
  // Strategy status changed → In-app (v1)
  // -----------------------------
  if (event.type === "strategy_status_changed") {
    const prefs = await getNotificationPrefs(prisma, event.userId);
    if (prefs && !prefs.strategyStatus) {
      return { ok: true as const, skipped: true as const, key };
    }

    const title = "Aura - Strategy";
    const body = event.isPaused ? "⏸️ Aura is now paused" : "▶️ Aura is now running";

    await publishInAppNotification(event.userId, {
      type: "strategy_status",
      title,
      body,
      ts: event.ts,
      deepLink: "/app/live-control",
    });

    return { ok: true as const, skipped: false as const, key };
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
      const viewUrl = `${appOrigin}/app/trades/${event.tradeId}`;

      const pnlUsd = Number(
        (trade?.realizedPnlUsd as any)?.toNumber?.() ??
          trade?.realizedPnlUsd ??
          event.realisedPnlUsd
      );

      const isWin = event.result === "win";
      const isLoss = event.result === "loss";

      const badgeText = isWin ? "WIN" : isLoss ? "LOSS" : "BREAKEVEN";
      const badgeBg = isWin ? "#1b3a2a" : isLoss ? "#3a1b1b" : "#2a2a2a";
      const badgeBorder = isWin ? "#2f8a57" : isLoss ? "#b23a3a" : "#555555";

      const symbol = trade?.symbol ?? event.symbol;

      const side = (trade?.side ?? "").toString().toUpperCase();
      const direction = side === "SELL" ? "Short" : "Long";

      const qty = Number((trade?.qty as any)?.toNumber?.() ?? trade?.qty ?? 0);

      const entryPx = Number(
        (trade?.entryPriceAvg as any)?.toNumber?.() ?? trade?.entryPriceAvg ?? NaN
      );
      const exitPx = Number(
        (trade?.exitPriceAvg as any)?.toNumber?.() ?? trade?.exitPriceAvg ?? NaN
      );

      const fmtMoney = (v: number) => {
        const s = v > 0 ? "+" : v < 0 ? "-" : "";
        return `${s}$${Math.abs(v).toFixed(2)}`;
      };

      const fmtPrice = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");

      const closedAtIso =
        trade?.closedAt?.toISOString?.() ??
        event.exitTs ??
        event.ts ??
        new Date().toISOString();

      const subject = `Aura – ${badgeText} on ${symbol} (${fmtMoney(pnlUsd)})`;

      const html = `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
  Aura trade closed: ${badgeText} ${fmtMoney(pnlUsd)} on ${symbol}.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0b;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="width:100%;max-width:640px;">
        <tr>
          <td style="padding:0 0 14px 0;">
            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; letter-spacing:0.3px; color:#f5f5f5; font-size:18px; font-weight:700;">
              Aura
              <span style="color:#d6b25e;">•</span>
              Trade Closed
            </div>
            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:#b5b5b5; font-size:12px; margin-top:6px;">
              ${new Date(closedAtIso).toLocaleString("en-GB", { timeZone: "Europe/London" })} (UK)
            </div>
          </td>
        </tr>

        <tr>
          <td style="background:#141414;border:1px solid #222;border-radius:16px;padding:18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="left">
                  <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${badgeBg};border:1px solid ${badgeBorder};color:#f5f5f5;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;font-weight:700;">
                    ${badgeText}
                  </span>
                </td>
                <td align="right" style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#d6b25e;font-size:14px;font-weight:700;">
                  ${fmtMoney(pnlUsd)}
                </td>
              </tr>
            </table>

            <div style="height:12px;"></div>

            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#f5f5f5;font-size:18px;font-weight:700;line-height:1.25;">
              ${direction} ${qty ? `${qty}x ` : ""}${symbol}
            </div>
            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#b5b5b5;font-size:13px;margin-top:8px;line-height:1.45;">
              Entry <span style="color:#f5f5f5;">${fmtPrice(entryPx)}</span>
              <span style="color:#444;padding:0 8px;">•</span>
              Exit <span style="color:#f5f5f5;">${fmtPrice(exitPx)}</span>
            </div>

            <div style="height:14px;"></div>
            <div style="height:1px;background:#222;"></div>
            <div style="height:14px;"></div>

            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <a href="${viewUrl}"
                     style="display:inline-block;background:#d6b25e;color:#0b0b0b;text-decoration:none;
                            font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
                            font-size:13px;font-weight:700;padding:10px 14px;border-radius:12px;">
                    View trade
                  </a>
                </td>
                <td style="padding-left:12px;">
                  <span style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#777;font-size:12px;">
                    Trade ID: <span style="color:#aaa;">${event.tradeId}</span>
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:14px 2px 0 2px;">
            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#777;font-size:11px;line-height:1.45;">
              You’re receiving this because trade notifications are enabled for your Aura account.
              <br />
              Trading involves risk. Past performance does not guarantee future results.
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
`;

      await sendEmail({ to: toEmail, subject, html });
    }

    return { ok: true as const, skipped: false as const, key };
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
      deepLink: `/app/trades/${event.tradeId}`,
    });

    return { ok: true as const, skipped: false as const, key };
  }

  if (event.type === "session_summary") {
    // v1: not wired yet
    return { ok: true as const, skipped: false as const, key };
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
