// src/lib/notifications/email.ts
import type { SessionSummaryEvent } from "./events";

export async function sendEmailSessionSummary(_event: SessionSummaryEvent) {
  // v1 stub: implement Postmark later
  return { ok: true as const, provider: "stub" as const };
}
