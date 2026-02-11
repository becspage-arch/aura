// src/lib/notifications/email.ts
import { Resend } from "resend";
import type { SessionSummaryEvent } from "./events";

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

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const resend = getResend();

  const res = await resend.emails.send({
    from: getFrom(),
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  return { ok: true as const, provider: "resend" as const, res };
}

export async function sendEmailSessionSummary(event: SessionSummaryEvent, toEmail: string) {
  const subject = `Aura – ${event.period.kind === "daily" ? "Daily" : "Session"} Summary (${event.period.label})`;

  const pct = Math.round(event.winRate * 100);
  const pnlSign = event.netPnlUsd > 0 ? "+" : "";

  const html = `
    <div style="font-family: ui-sans-serif, system-ui; line-height: 1.4">
      <h2 style="margin: 0 0 12px 0;">Aura Summary</h2>
      <div style="margin-bottom: 12px;">
        <div><strong>Period:</strong> ${event.period.label}</div>
        <div><strong>Trades:</strong> ${event.tradesCount}</div>
        <div><strong>Wins/Losses/BE:</strong> ${event.wins} / ${event.losses} / ${event.breakeven}</div>
        <div><strong>Win rate:</strong> ${pct}%</div>
        <div><strong>Net PnL:</strong> ${pnlSign}$${Math.abs(event.netPnlUsd).toFixed(0)}</div>
      </div>
      <div style="color: #666; font-size: 12px;">
        You’re receiving this because your Aura account is enabled for summary emails (v1).
      </div>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, html });
}
