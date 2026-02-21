// src/components/dashboard/dashboardFormat.ts
const LONDON_TZ = "Europe/London";

export function fmtMoneyUsd(v: any) {
  if (v == null) return "$—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "$—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

export function fmtMoneyUsdSignedShort(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  const sign = n < 0 ? "-" : "+";
  const abs = Math.abs(n);
  const whole = Math.round(abs);
  return `${sign}$${whole}`;
}

export function fmtFixed(v: any, digits = 2) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function fmtTimeLondon(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: LONDON_TZ,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function parseDayToUTCDate(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

export function weekdayIndexMondayFirst(d: Date) {
  const js = d.getUTCDay();
  return (js + 6) % 7;
}

export function getLondonTz() {
  return LONDON_TZ;
}
