// src/lib/notifications/email.ts
import { Resend } from "resend";
import type { SessionSummaryEvent } from "./events";
import { renderAuraEmail } from "./emailTemplate";

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

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const resend = getResend();

  const res = await resend.emails.send({
    from: getFrom(),
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  return { ok: true as const, provider: "resend" as const, res };
}

function fmtMoney(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtMoneyNoCents(v: number) {
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(0)}`;
}

function londonStamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London" }) + " (UK)";
}

export async function sendEmailSessionSummary(event: SessionSummaryEvent, toEmail: string) {
  const kindLabel = event.period.kind === "daily" ? "Daily Summary" : "Session Summary";

  const pct = Math.round((event.winRate ?? 0) * 100);
  const net = Number(event.netPnlUsd ?? 0);

  // Badge tone based on net PnL
  const badgeTone = net > 0 ? "win" : net < 0 ? "loss" : "neutral";
  const badgeText = net > 0 ? "UP" : net < 0 ? "DOWN" : "FLAT";

  const subject = `Aura – ${kindLabel} (${event.period.label}) • ${fmtMoneyNoCents(net)}`;

  const html = renderAuraEmail({
    preheader: `Aura ${kindLabel}: ${fmtMoneyNoCents(net)} net on ${event.period.label}.`,
    headerKickerLeft: "Aura",
    headerKickerRight: kindLabel,
    headerSubline: londonStamp(event.ts),

    badgeText,
    badgeTone,
    topRightText: fmtMoney(net),

    title: event.period.label,
    subtitle: `${event.tradesCount} trades • Win rate ${pct}% • Wins/Losses/BE ${event.wins} / ${event.losses} / ${event.breakeven}`,

    rows: [
      { label: "Period start", value: londonStamp(event.period.startTs) },
      { label: "Period end", value: londonStamp(event.period.endTs) },
      { label: "Trades", value: String(event.tradesCount) },
      { label: "Wins", value: String(event.wins) },
      { label: "Losses", value: String(event.losses) },
      { label: "Breakeven", value: String(event.breakeven) },
      { label: "Win rate", value: `${pct}%` },
      { label: "Net PnL", value: fmtMoney(net) },
    ],

    footerLine1:
      "You’re receiving this because summary emails are enabled for your Aura account.",
  });

  return sendEmail({ to: toEmail, subject, html });
}
