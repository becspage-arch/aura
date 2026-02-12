// worker/src/notifications/emitDailySummary.ts

import { Resend } from "resend";

type EmitDailySummaryParams = {
  prisma: any; // PrismaClient in worker
  clerkUserId: string; // Clerk user id (matches Trade.clerkUserId)
};

type SessionSummaryEvent = {
  type: "session_summary";
  ts: string;
  userId: string;
  period: {
    kind: "daily";
    label: string; // YYYY-MM-DD (London)
    startTs: string;
    endTs: string;
  };
  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  netPnlUsd: number;
  winRate: number; // 0..1
};

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY");
  return new Resend(key);
}

function getFrom() {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("Missing EMAIL_FROM");
  return from;
}

function toNum(v: any) {
  // Prisma Decimal.js support + fallbacks
  return Number(v?.toNumber?.() ?? v ?? 0);
}

/**
 * Returns tz offset in ms for a given Date at a given timeZone.
 * Positive means timeZone is ahead of UTC at that instant.
 */
function tzOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  const ss = Number(parts.second);

  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  return asIfUtc - date.getTime();
}

/**
 * London date label for a given Date (YYYY-MM-DD in Europe/London).
 */
function londonDayLabel(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${day}`;
}

/**
 * Compute the UTC Date that corresponds to London local midnight for the given London Y-M-D.
 * Uses offset at a nearby instant and is stable for DST; we compute start-of-next-day separately
 * to correctly handle 23/25 hour days.
 */
function londonMidnightUtcFromYmd(y: number, m: number, d: number) {
  // Initial guess: UTC midnight of that YMD
  const guessUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0);

  // Offset for London at that instant
  const offset = tzOffsetMs(new Date(guessUtcMs), "Europe/London");

  // London midnight = UTC midnight - offset (if London is +1, we go back 1h)
  return new Date(guessUtcMs - offset);
}

function londonDayBoundsUtc(now: Date) {
  // Get today's Y-M-D in London
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);

  const startUtc = londonMidnightUtcFromYmd(y, m, d);

  // Compute tomorrow in London by adding 36h then re-reading London YMD (safe across DST)
  const tomorrowProbe = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  const tParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(tomorrowProbe)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const ty = Number(tParts.year);
  const tm = Number(tParts.month);
  const td = Number(tParts.day);

  const endUtc = londonMidnightUtcFromYmd(ty, tm, td);

  return { startUtc, endUtc, label: `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}` };
}

async function tryCreateNotificationLog(prisma: any, key: string, userId: string, type: string) {
  try {
    await prisma.notificationLog.create({
      data: { key, userId, type },
    });
    return true;
  } catch (err: any) {
    // Prisma unique constraint error
    if (err?.code === "P2002") return false;
    throw err;
  }
}

export async function emitDailySummary(params: EmitDailySummaryParams) {
  const now = new Date();
  const { startUtc, endUtc, label } = londonDayBoundsUtc(now);

  // 1) Respect prefs + ensure we have an email
  const profile = await params.prisma.userProfile.findUnique({
    where: { clerkUserId: params.clerkUserId },
    select: { email: true, id: true, notificationPrefs: { select: { dailySummary: true } } },
  });

  const toEmail = profile?.email ?? null;
  const dailyOn = profile?.notificationPrefs?.dailySummary ?? false;

  if (!toEmail || !dailyOn) {
    console.log("[daily-summary] skipped (no email or pref off)", {
      clerkUserId: params.clerkUserId,
      hasEmail: Boolean(toEmail),
      dailyOn,
      label,
    });
    return { ok: true, skipped: true, reason: "no_email_or_pref_off" as const };
  }

  // 2) Dedup: one per London day
  const key = `${params.clerkUserId}:session_summary:daily:${label}`;
  const created = await tryCreateNotificationLog(params.prisma, key, params.clerkUserId, "session_summary");
  if (!created) {
    console.log("[daily-summary] skipped (duplicate)", { key, label });
    return { ok: true, skipped: true, reason: "duplicate" as const };
  }

  // 3) Query trades closed in this London day
  const trades = await params.prisma.trade.findMany({
    where: {
      clerkUserId: params.clerkUserId,
      closedAt: { gte: startUtc, lt: endUtc },
    },
    select: {
      outcome: true,
      realizedPnlUsd: true,
    },
  });

  const tradesCount = trades.length;

  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let netPnlUsd = 0;

  for (const t of trades) {
    const o = String(t.outcome || "").toUpperCase();
    if (o === "WIN") wins += 1;
    else if (o === "LOSS") losses += 1;
    else breakeven += 1;

    netPnlUsd += toNum(t.realizedPnlUsd);
  }

  const winRate = tradesCount > 0 ? wins / tradesCount : 0;

  const event: SessionSummaryEvent = {
    type: "session_summary",
    ts: now.toISOString(),
    userId: params.clerkUserId,
    period: {
      kind: "daily",
      label,
      startTs: startUtc.toISOString(),
      endTs: endUtc.toISOString(),
    },
    tradesCount,
    wins,
    losses,
    breakeven,
    netPnlUsd,
    winRate,
  };

  // 4) Send email (simple v1 template)
  const resend = getResend();
  const pct = Math.round(event.winRate * 100);
  const pnlSign = event.netPnlUsd > 0 ? "+" : "";

  const subject = `Aura – Daily Summary (${event.period.label})`;

  const html = `
<div style="background:#0b0b0b;padding:24px;">
  <div style="max-width:640px;margin:0 auto;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#f5f5f5;">
    <div style="font-size:18px;font-weight:800;letter-spacing:0.3px;">
      Aura <span style="color:#d6b25e;">•</span> Daily Summary
    </div>
    <div style="color:#b5b5b5;font-size:12px;margin-top:6px;">
      ${new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })} (UK)
    </div>

    <div style="margin-top:14px;background:#141414;border:1px solid #222;border-radius:16px;padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:14px;color:#b5b5b5;">Period</div>
        <div style="font-size:14px;font-weight:800;color:#f5f5f5;">${event.period.label}</div>
      </div>

      <div style="height:10px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:14px;color:#b5b5b5;">Trades</div>
        <div style="font-size:14px;font-weight:800;color:#f5f5f5;">${event.tradesCount}</div>
      </div>

      <div style="height:10px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:14px;color:#b5b5b5;">Wins / Losses / BE</div>
        <div style="font-size:14px;font-weight:800;color:#f5f5f5;">${event.wins} / ${event.losses} / ${event.breakeven}</div>
      </div>

      <div style="height:10px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:14px;color:#b5b5b5;">Win rate</div>
        <div style="font-size:14px;font-weight:800;color:#f5f5f5;">${pct}%</div>
      </div>

      <div style="height:10px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:14px;color:#b5b5b5;">Net PnL</div>
        <div style="font-size:16px;font-weight:900;color:#d6b25e;">
          ${pnlSign}$${Math.abs(event.netPnlUsd).toFixed(2)}
        </div>
      </div>
    </div>

    <div style="color:#777;font-size:11px;line-height:1.4;margin-top:12px;">
      You’re receiving this because daily summary emails are enabled for your Aura account.
      <br/>
      Trading involves risk. Past performance does not guarantee future results.
    </div>
  </div>
</div>
`;

  await resend.emails.send({
    from: getFrom(),
    to: toEmail,
    subject,
    html,
  });

  console.log("[daily-summary] sent", {
    label,
    toEmail,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    tradesCount,
    netPnlUsd,
  });

  return { ok: true, skipped: false, label, toEmail, tradesCount, netPnlUsd };
}
