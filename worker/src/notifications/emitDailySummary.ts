// worker/src/notifications/emitDailySummary.ts
// **** This needs fixing for future.... was giving error on build..... import { notify } from "./notify.js";
import type { SessionSummaryEvent } from "../../../src/lib/notifications/events";

type EmitDailySummaryParams = {
  prisma: any; // PrismaClient in worker
  clerkUserId: string;
};

function dayLabelLondon(d: Date) {
  // YYYY-MM-DD in Europe/London
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

export async function emitDailySummary(params: EmitDailySummaryParams) {
  const now = new Date();
  const label = dayLabelLondon(now);

  // We summarise "today so far" for v1 (end-of-day run will be near midnight).
  // Later we can summarise "yesterday" precisely.
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = now;

  // TODO: replace this query with your actual trades table
  // For now, send a minimal placeholder summary so Phase 1 is complete end-to-end.
  const tradesCount = 0;
  const wins = 0;
  const losses = 0;
  const breakeven = 0;
  const netPnlUsd = 0;
  const winRate = 0;

  const event: SessionSummaryEvent = {
    type: "session_summary",
    ts: now.toISOString(),
    userId: params.clerkUserId,
    period: {
      kind: "daily",
      label,
      startTs: start.toISOString(),
      endTs: end.toISOString(),
    },
    tradesCount,
    wins,
    losses,
    breakeven,
    netPnlUsd,
    winRate,
  };

  const res = await notify(event as any, { prisma: params.prisma });

  console.log("[daily-summary] emitted", { label, res });
}
