// src/app/api/trading-state/risk-settings/route.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ensureUserProfile } from "@/lib/user-profile";
import { publishToUser } from "@/lib/ably/server";
import { writeAuditLog, writeEventLog } from "@/lib/logging/server";

type EntryType = "market" | "limit";

type RiskSettings = {
  riskUsd: number;
  rr: number;
  maxStopTicks: number;
  entryType: EntryType;
};

const DEFAULTS: RiskSettings = {
  riskUsd: 50,
  rr: 2,
  maxStopTicks: 50,
  entryType: "market",
};

function clampNumber(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeRiskSettings(input: unknown): RiskSettings {
  const obj = (input ?? {}) as Partial<RiskSettings>;

  const entryType: EntryType =
    obj.entryType === "limit" ? "limit" : "market";

  return {
    riskUsd: clampNumber(obj.riskUsd, 1, 5000, DEFAULTS.riskUsd),
    rr: clampNumber(obj.rr, 0.5, 10, DEFAULTS.rr),
    maxStopTicks: clampNumber(obj.maxStopTicks, 1, 500, DEFAULTS.maxStopTicks),
    entryType,
  };
}

function mergeAndNormalize(existing: unknown, patch: unknown): RiskSettings {
  const base = normalizeRiskSettings(existing);
  const p = (patch ?? {}) as Record<string, unknown>;
  return normalizeRiskSettings({ ...base, ...p });
}

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const state = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const riskSettings = normalizeRiskSettings(state.riskSettings);

  // Optional: persist defaults if missing/invalid (keeps DB consistent)
  if (!state.riskSettings) {
    await db.userTradingState.update({
      where: { userId: user.id },
      data: { riskSettings },
    });
  }

  return Response.json({ ok: true, riskSettings });
}

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));

  const user = await ensureUserProfile({
    clerkUserId,
    email: null,
    displayName: null,
  });

  const current = await db.userTradingState.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const nextRiskSettings = mergeAndNormalize(current.riskSettings, body);

  const next = await db.userTradingState.update({
    where: { userId: user.id },
    data: { riskSettings: nextRiskSettings },
  });

  await writeAuditLog(user.id, "RISK_SETTINGS_UPDATED", nextRiskSettings);

  await writeEventLog({
    type: "config_changed",
    level: "info",
    message: "Risk settings updated",
    data: nextRiskSettings,
    userId: user.id,
  });

  // notify UI (and later worker if we choose to listen)
  await publishToUser(clerkUserId, "risk_settings_update", {
    riskSettings: normalizeRiskSettings(next.riskSettings),
  });

  return Response.json({
    ok: true,
    riskSettings: normalizeRiskSettings(next.riskSettings),
  });
}
