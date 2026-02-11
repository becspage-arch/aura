// worker/src/broker/manualExecListener.ts
import Ably from "ably";
import type { PrismaClient } from "@prisma/client";
import type { IBrokerAdapter } from "./IBrokerAdapter.js";
import { executeBracket } from "../execution/executeBracket.js";
import { logTag } from "../lib/logTags";
import { publishInAppNotification } from "../notifications/publishInApp.js";

type EnvLike = {
  WORKER_NAME: string;
};

type ManualExecPayload = {
  token?: unknown;
  clerkUserId?: unknown;
  contractId?: unknown;
  symbol?: unknown;
  side?: unknown;
  size?: unknown;
  entryType?: unknown;
  stopLossTicks?: unknown;
  takeProfitTicks?: unknown;
  customTag?: unknown;
  execKey?: unknown;
};

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim();
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return null;
}

function asSide(v: unknown): "buy" | "sell" | null {
  const s = asString(v)?.toLowerCase();
  if (s === "buy" || s === "sell") return s;
  return null;
}

function asEntryType(v: unknown): "market" | "limit" | "stop" {
  const s = asString(v)?.toLowerCase();
  if (s === "limit" || s === "stop" || s === "market") return s;
  return "market";
}

function sanitizePayload(p: ManualExecPayload) {
  return {
    token: asString(p.token) ? "***" : null,
    clerkUserId: asString(p.clerkUserId),
    contractId: asString(p.contractId),
    symbol: asString(p.symbol),
    side: asString(p.side),
    size: p.size,
    entryType: asString(p.entryType),
    stopLossTicks: p.stopLossTicks,
    takeProfitTicks: p.takeProfitTicks,
    customTag: asString(p.customTag),
    execKey: asString(p.execKey),
  };
}

function reject(env: EnvLike, reason: string, details: Record<string, unknown>) {
  // Keep it grep-friendly + explicit
  console.warn("[manual-exec] rejected payload", { reason, ...details });
  logTag(`[${env.WORKER_NAME}] MANUAL_EXEC_REJECTED`, { reason, ...details });
}

export async function startManualExecListener(params: {
  env: EnvLike;
  DRY_RUN: boolean;
  broker: IBrokerAdapter;
  getPrisma: () => PrismaClient;
  getUserIdentityForWorker: () => Promise<{ clerkUserId: string; userId: string }>;
  enabled: boolean;
  manualToken: string;
  expectedUser: string;
}) {
  if (!params.enabled) return;

  const apiKey = (process.env.ABLY_API_KEY || "").trim();
  if (!apiKey) {
    console.warn(`[${params.env.WORKER_NAME}] manual exec enabled but ABLY_API_KEY missing`);
    return;
  }

  const client = new Ably.Realtime(apiKey);

  // IMPORTANT: match how you publish: aura:exec:<clerkUserId>
  const channelName = `aura:exec:${params.expectedUser}`;
  const execChannel = client.channels.get(channelName);

  execChannel.subscribe("exec.manual_bracket", async (msg) => {
    console.log(`[${params.env.WORKER_NAME}] exec.manual_bracket RECEIVED`, msg.data);

    const payload = (msg.data || {}) as ManualExecPayload;
    const safe = sanitizePayload(payload);

    // --- Validate token ---
    const token = asString(payload.token);
    if (!token) {
      return reject(params.env, "missing_token", { channelName, safe });
    }
    if (!params.manualToken || token !== params.manualToken) {
      return reject(params.env, "token_mismatch", {
        channelName,
        safe,
        expectedTokenLen: params.manualToken?.length ?? 0,
        gotTokenLen: token.length,
      });
    }

    // --- Validate intended user ---
    const clerkUserId = asString(payload.clerkUserId);
    if (!clerkUserId) {
      return reject(params.env, "missing_clerkUserId", { channelName, safe });
    }
    if (params.expectedUser && clerkUserId !== params.expectedUser) {
      return reject(params.env, "clerkUserId_mismatch", {
        channelName,
        safe,
        expectedUser: params.expectedUser,
      });
    }

    // --- Validate required order fields ---
    const contractId = asString(payload.contractId);
    const side = asSide(payload.side);
    const qty = asNumber(payload.size);

    if (!contractId) {
      return reject(params.env, "missing_contractId", { channelName, safe });
    }
    if (!side) {
      return reject(params.env, "invalid_side", { channelName, safe, allowed: ["buy", "sell"] });
    }
    if (!qty || qty <= 0) {
      return reject(params.env, "invalid_size", { channelName, safe, note: "size must be > 0" });
    }

    const stopLossTicks = asNumber(payload.stopLossTicks);
    const takeProfitTicks = asNumber(payload.takeProfitTicks);

    logTag(`[${params.env.WORKER_NAME}] MANUAL_EXEC_PARSED`, {
      channelName,
      payloadExecKey: asString(payload.execKey),
      contractId,
      side,
      qty,
      stopLossTicks,
      takeProfitTicks,
    });

    if (stopLossTicks == null || stopLossTicks <= 0) {
      return reject(params.env, "invalid_stopLossTicks", {
        channelName,
        safe,
        note: "stopLossTicks must be a positive number",
      });
    }

    if (takeProfitTicks == null || takeProfitTicks <= 0) {
      return reject(params.env, "invalid_takeProfitTicks", {
        channelName,
        safe,
        note: "takeProfitTicks must be a positive number",
      });
    }

    // --- Map worker user identity (internal userId) ---
    let ident: { clerkUserId: string; userId: string };
    try {
      ident = await params.getUserIdentityForWorker();
    } catch (e) {
      return reject(params.env, "worker_identity_failed", {
        channelName,
        safe,
        err: e instanceof Error ? e.message : String(e),
      });
    }

    // Safety: ensure worker identity matches payload
    if (ident.clerkUserId !== clerkUserId) {
      return reject(params.env, "worker_user_mismatch", {
        channelName,
        safe,
        workerClerkUserId: ident.clerkUserId,
      });
    }

    // --- Build exec input and execute via executeBracket (so ORDER_SUBMITTED tag fires) ---
    const entryType = asEntryType(payload.entryType);
    const symbol = asString(payload.symbol);

    const execKey = `manual:${clerkUserId}:${Date.now()}:${contractId}:${side}:${qty}:${stopLossTicks}:${takeProfitTicks}`;

    const customTag = asString(payload.customTag) || null;

    if (params.DRY_RUN) {
      console.log("[manual-exec] DRY_RUN would execute", {
        execKey,
        contractId,
        side,
        qty,
        entryType,
        stopLossTicks,
        takeProfitTicks,
      });
      logTag(`[${params.env.WORKER_NAME}] MANUAL_EXEC_DRY_RUN`, {
        execKey,
        contractId,
        side,
        qty,
        entryType,
        stopLossTicks,
        takeProfitTicks,
      });
      return;
    }

    try {
      const prisma = params.getPrisma();

      await executeBracket({
        prisma,
        broker: params.broker,
        input: {
          execKey,
          userId: ident.userId,
          brokerName: (params.broker as any)?.name ?? "unknown",
          contractId,
          symbol,
          side,
          qty,
          entryType,
          stopLossTicks,
          takeProfitTicks,
          customTag,
        },
      });

      const now = new Date().toISOString();
      const dir = side === "buy" ? "🟦 ENTERED LONG" : "🟥 ENTERED SHORT";

      await publishInAppNotification(clerkUserId, {
        type: "trade_opened",
        title: "Aura - Trade Opened",
        body: `${dir} ${Math.round(qty)}x ${symbol || contractId}`,
        ts: now,
        deepLink: "/app/trades",
      });

      console.log("[manual-exec] MANUAL_ORDER_SUBMITTED", { execKey });
      logTag(`[${params.env.WORKER_NAME}] MANUAL_EXEC_ACCEPTED`, {
        execKey,
        contractId,
        side,
        qty,
        entryType,
        stopLossTicks,
        takeProfitTicks,
      });
    } catch (e) {
      console.error("[manual-exec] executeBracket failed", e);
      logTag(`[${params.env.WORKER_NAME}] MANUAL_EXEC_FAILED`, {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  });

  console.log(
    `[${params.env.WORKER_NAME}] manual execution listening (exec.manual_bracket)`,
    { channelName }
  );
}
