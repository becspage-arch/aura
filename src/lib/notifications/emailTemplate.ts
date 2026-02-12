// src/lib/notifications/emailTemplate.ts

type BadgeTone = "win" | "loss" | "neutral" | "gold";

export type AuraEmailRow = {
  label: string;
  value: string;
};

export type AuraEmailCta = {
  label: string;
  href: string;
  hintRight?: string;
};

export type AuraEmailParams = {
  preheader: string;

  // Header
  headerKickerLeft?: string; // e.g. "Aura"
  headerKickerRight?: string; // e.g. "Trade Closed" / "Daily Summary"
  headerSubline?: string; // e.g. "12 Feb 2026, 23:59 (UK)"

  // Card top row
  badgeText?: string; // e.g. "WIN"
  badgeTone?: BadgeTone;
  topRightText?: string; // e.g. "+$120.00"

  // Card body
  title: string; // main card title (big)
  subtitle?: string; // supporting line (muted)

  // Details
  rows?: AuraEmailRow[];

  // CTA
  cta?: AuraEmailCta;

  // Footer
  footerLine1?: string;
  footerLine2?: string;
};

function badgeStyles(tone: BadgeTone) {
  if (tone === "win") return { bg: "#1b3a2a", border: "#2f8a57", text: "#f5f5f5" };
  if (tone === "loss") return { bg: "#3a1b1b", border: "#b23a3a", text: "#f5f5f5" };
  if (tone === "gold") return { bg: "#2a2414", border: "#d6b25e", text: "#f5f5f5" };
  return { bg: "#2a2a2a", border: "#555555", text: "#f5f5f5" };
}

export function renderAuraEmail(params: AuraEmailParams) {
  const {
    preheader,
    headerKickerLeft = "Aura",
    headerKickerRight = "Notification",
    headerSubline,

    badgeText,
    badgeTone = "neutral",
    topRightText,

    title,
    subtitle,

    rows = [],
    cta,

    footerLine1 = "You’re receiving this because notifications are enabled for your Aura account.",
    footerLine2 = "Trading involves risk. Past performance does not guarantee future results.",
  } = params;

  const badge = badgeText ? badgeStyles(badgeTone) : null;

  const rowsHtml =
    rows.length > 0
      ? `
      <div style="height:14px;"></div>
      <div style="height:1px;background:#222;"></div>
      <div style="height:14px;"></div>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${rows
          .map(
            (r) => `
          <tr>
            <td style="padding:6px 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#b5b5b5;font-size:12px;">
              ${escapeHtml(r.label)}
            </td>
            <td align="right" style="padding:6px 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#f5f5f5;font-size:12px;font-weight:700;">
              ${escapeHtml(r.value)}
            </td>
          </tr>
        `
          )
          .join("")}
      </table>
    `
      : "";

  const ctaHtml = cta
    ? `
      <div style="height:14px;"></div>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <a href="${escapeAttr(cta.href)}"
               style="display:inline-block;background:#d6b25e;color:#0b0b0b;text-decoration:none;
                      font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
                      font-size:13px;font-weight:700;padding:10px 14px;border-radius:12px;">
              ${escapeHtml(cta.label)}
            </a>
          </td>
          ${
            cta.hintRight
              ? `
            <td style="padding-left:12px;">
              <span style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#777;font-size:12px;">
                ${escapeHtml(cta.hintRight)}
              </span>
            </td>
          `
              : ""
          }
        </tr>
      </table>
    `
    : "";

  const html = `
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
  ${escapeHtml(preheader)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0b;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="width:100%;max-width:640px;">

        <!-- Header -->
        <tr>
          <td style="padding:0 0 14px 0;">
            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; letter-spacing:0.3px; color:#f5f5f5; font-size:18px; font-weight:700;">
              ${escapeHtml(headerKickerLeft)}
              <span style="color:#d6b25e;">•</span>
              ${escapeHtml(headerKickerRight)}
            </div>
            ${
              headerSubline
                ? `
              <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:#b5b5b5; font-size:12px; margin-top:6px;">
                ${escapeHtml(headerSubline)}
              </div>
            `
                : ""
            }
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#141414;border:1px solid #222;border-radius:16px;padding:18px;">
            <!-- Badge row -->
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="left">
                  ${
                    badge
                      ? `
                    <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${badge.bg};border:1px solid ${badge.border};color:${badge.text};font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:12px;font-weight:700;">
                      ${escapeHtml(badgeText ?? "")}
                    </span>
                  `
                      : ""
                  }
                </td>
                <td align="right" style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#d6b25e;font-size:14px;font-weight:700;">
                  ${topRightText ? escapeHtml(topRightText) : ""}
                </td>
              </tr>
            </table>

            <div style="height:12px;"></div>

            <!-- Summary -->
            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#f5f5f5;font-size:18px;font-weight:700;line-height:1.25;">
              ${escapeHtml(title)}
            </div>
            ${
              subtitle
                ? `
              <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#b5b5b5;font-size:13px;margin-top:8px;line-height:1.45;">
                ${escapeHtml(subtitle)}
              </div>
            `
                : ""
            }

            ${rowsHtml}

            ${ctaHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:14px 2px 0 2px;">
            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#777;font-size:11px;line-height:1.45;">
              ${escapeHtml(footerLine1)}
              <br />
              ${escapeHtml(footerLine2)}
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
`;

  return html;
}

// Tiny helpers so labels/values can’t break the HTML
function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s: string) {
  // For href etc
  return escapeHtml(s);
}
