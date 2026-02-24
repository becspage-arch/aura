// src/app/api/activity/_lib/activity.ts
import { prisma } from "@/lib/prisma";

export type ActivityScope = "user" | "aura" | "system";

export type ActivityItem =
  | {
      kind: "user_action";
      id: string;
      createdAt: string; // ISO
      title: string;
      summary: string;
      details: any | null;
    }
  | {
      kind: "trade_decision";
      id: string;
      createdAt: string; // ISO
      title: string;
      summary: string;
      details: any | null;
      symbol: string;
      side: "BUY" | "SELL";
      status: "DETECTED" | "BLOCKED" | "TAKEN";
      blockReason: string | null;
    }
  | {
      kind: "system_event";
      id: string;
      createdAt: string; // ISO
      title: string;
      summary: string;
      details: any | null;
      level: string;
      type: string;
    };

function truncate(s: string, n: number) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function safeJson(v: any) {
  try {
    if (v == null) return "";
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

export type SystemPreset = "important" | "errors" | "settings" | "all";

const BLOCK_REASON_LABEL: Record<string, string> = {
  IN_TRADE: "Already in a trade",
  PAUSED: "Paused",
  KILL_SWITCH: "Kill switch on",
  NOT_LIVE_CANDLE: "Not live candle",
  INVALID_BRACKET: "Invalid bracket",
  EXECUTION_FAILED: "Execution failed",
  OUTSIDE_TRADING_WINDOWS: "Outside trading window",

  NO_ACTIVE_FVG: "No active FVG",
  FVG_INVALID: "FVG invalidated",
  FVG_ALREADY_TRADED: "Already traded",
  NOT_RETESTED: "No retest",
  DIRECTION_MISMATCH: "Direction mismatch",
  NO_EXPANSION_PATTERN: "No expansion pattern",
  STOP_INVALID: "Stop invalid",
  STOP_TOO_BIG: "Stop too big",
  CONTRACTS_ZERO: "Contracts = 0",
};

function labelBlockReason(r: string | null | undefined) {
  if (!r) return "";
  return BLOCK_REASON_LABEL[r] ?? r;
}

function isHeartbeatLike(type: string, message: string | null | undefined) {
  const t = (type || "").toLowerCase();
  const m = (message || "").toLowerCase();
  return t.includes("heartbeat") || m.includes("heartbeat");
}

function isNoisySystemType(type: string) {
  if (!type) return true;

  // Hard exclusions (confirmed by your Neon query)
  if (type === "market.quote") return true;
  if (type === "worker_heartbeat") return true;

  // Existing exclusions
  if (type.startsWith("candle_")) return true;

  return false;
}

function isSettingsType(type: string) {
  return type === "control_changed" || type === "config_changed";
}

function isExecType(type: string) {
  return type.startsWith("exec.");
}

function keepByPreset(params: { type: string; level: string; preset: SystemPreset }) {
  const t = params.type;
  const lvl = (params.level || "").toLowerCase();
  const preset = params.preset;

  if (preset === "all") return true;

  if (preset === "errors") {
    return lvl === "warn" || lvl === "error";
  }

  if (preset === "settings") {
    return isSettingsType(t);
  }

  // preset === "important" (default)
  return lvl === "warn" || lvl === "error" || isSettingsType(t) || isExecType(t);
}

type Cursor = { createdAt: Date; id: string } | null;

function parseCursor(cursor: string | null): Cursor {
  if (!cursor) return null;
  const [ts, id] = cursor.split("|");
  if (!ts || !id) return null;
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return null;
  return { createdAt: d, id };
}

function cursorWhere(cursor: Cursor) {
  if (!cursor) return undefined;

  // createdAt desc, id desc
  return {
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  };
}

function rangeWhere(params: { from?: Date | null; to?: Date | null }) {
  const { from, to } = params;
  if (!from && !to) return undefined;

  if (from && to) return { createdAt: { gte: from, lte: to } };
  if (from) return { createdAt: { gte: from } };
  return { createdAt: { lte: to! } };
}

export type ActivitySummary = {
  tradeOpportunities: number;
  tradesEntered: number;
  skipped: number;
  systemIssues: number; // warn+error count
};

export async function fetchActivity(params: {
  userId: string;

  includeMyActivity: boolean;
  includeTradeDecisions: boolean;
  includeAccountSystem: boolean;

  systemPreset?: SystemPreset;

  from?: Date | null;
  to?: Date | null;

  q: string | null;
  limit: number;
  cursor: string | null;
}) {
  const { userId } = params;

  const limit = Math.max(1, Math.min(100, params.limit));
  const q = (params.q || "").trim();
  const cursor = parseCursor(params.cursor);
  const systemPreset: SystemPreset = params.systemPreset ?? "important";

  const from = params.from ?? null;
  const to = params.to ?? null;

  // Pull a bit extra from each source so merge/sort has enough
  const perSourceTake = Math.min(200, limit * 4);

  const includeAudit = !!params.includeMyActivity;
  const includeAura = !!params.includeTradeDecisions;
  const includeSystem = !!params.includeAccountSystem;

  const auditPromise = includeAudit
    ? prisma.auditLog.findMany({
        where: {
          userId,
          ...(cursorWhere(cursor) as any),
          ...(rangeWhere({ from, to }) as any),
          ...(q
            ? {
                OR: [{ action: { contains: q, mode: "insensitive" } }],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: perSourceTake,
      })
    : Promise.resolve([]);

  const signalsPromise = includeAura
    ? prisma.strategySignal.findMany({
        where: {
          userId,
          ...(cursorWhere(cursor) as any),
          ...(rangeWhere({ from, to }) as any),
          ...(q
            ? {
                OR: [
                  { symbol: { contains: q, mode: "insensitive" } },
                  { strategy: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: perSourceTake,
      })
    : Promise.resolve([]);

  const systemPromise = includeSystem
    ? prisma.eventLog.findMany({
        where: {
          userId,
          ...(cursorWhere(cursor) as any),
          ...(rangeWhere({ from, to }) as any),
          ...(q
            ? {
                OR: [
                  { type: { contains: q, mode: "insensitive" } },
                  { message: { contains: q, mode: "insensitive" } },
                  { level: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: perSourceTake,
      })
    : Promise.resolve([]);

  const summaryPromise: Promise<ActivitySummary> = (async () => {
    // Trade decision summary (StrategySignal)
    const [tradeOpportunities, tradesEntered, skipped] = includeAura
      ? await Promise.all([
          prisma.strategySignal.count({
            where: { userId, ...(rangeWhere({ from, to }) as any) },
          }),
          prisma.strategySignal.count({
            where: { userId, status: "TAKEN", ...(rangeWhere({ from, to }) as any) },
          }),
          prisma.strategySignal.count({
            where: { userId, status: "BLOCKED", ...(rangeWhere({ from, to }) as any) },
          }),
        ])
      : [0, 0, 0];

    // System issues (EventLog warn/error, excluding noise)
    const systemIssues = includeSystem
      ? await prisma.eventLog.count({
          where: {
            userId,
            ...(rangeWhere({ from, to }) as any),
            level: { in: ["warn", "error"] },
            NOT: [{ type: "market.quote" }, { type: "worker_heartbeat" }],
          },
        })
      : 0;

    return { tradeOpportunities, tradesEntered, skipped, systemIssues };
  })();

  const [audit, signals, systemRaw, summary] = await Promise.all([
    auditPromise,
    signalsPromise,
    systemPromise,
    summaryPromise,
  ]);

  const auditItems: ActivityItem[] = (audit as any[]).map((a) => ({
    kind: "user_action",
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    title: a.action,
    summary: a.data ? truncate(safeJson(a.data).replace(/\s+/g, " ").trim(), 160) : "",
    details: a.data ?? null,
  }));

  const signalItems: ActivityItem[] = (signals as any[]).map((s) => {
    const status = String(s.status) as "DETECTED" | "BLOCKED" | "TAKEN";
    const br = s.blockReason ? String(s.blockReason) : null;

    const entered = status === "TAKEN";
    const skipped = status === "BLOCKED";

    const decisionLabel = entered ? "Entered" : skipped ? "Skipped" : "Detected";
    const reason = skipped ? labelBlockReason(br) : "";

    const title = `Trade opportunity – ${s.symbol}`;
    const summaryText =
      skipped && reason
        ? `${decisionLabel} - ${reason}`
        : entered
          ? `${decisionLabel} - ${s.side} • ${s.contracts ?? "—"} contracts`
          : `${decisionLabel} - ${s.side}`;

    return {
      kind: "trade_decision",
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      title,
      summary: truncate(summaryText, 180),
      details: {
        strategy: s.strategy,
        symbol: s.symbol,
        side: s.side,
        status,
        blockReason: br,
        entryTime: s.entryTime,
        fvgTime: s.fvgTime,
        entryPrice: s.entryPrice,
        stopPrice: s.stopPrice,
        takeProfitPrice: s.takeProfitPrice,
        stopTicks: s.stopTicks,
        tpTicks: s.tpTicks,
        rr: s.rr,
        contracts: s.contracts,
        riskUsdPlanned: s.riskUsdPlanned,
        execKey: s.execKey,
        executionId: s.executionId,
        meta: s.meta ?? null,
      },
      symbol: s.symbol,
      side: s.side,
      status,
      blockReason: br,
    };
  });

  const systemItems: ActivityItem[] = (systemRaw as any[])
    .filter((e) => !isNoisySystemType(String(e.type)))
    .filter((e) => !isHeartbeatLike(String(e.type), e.message))
    .filter((e) => keepByPreset({ type: String(e.type), level: String(e.level), preset: systemPreset }))
    .map((e) => ({
      kind: "system_event",
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      level: String(e.level ?? "info"),
      type: String(e.type ?? ""),
      title: `Account & system • ${String(e.type ?? "")}`,
      summary: truncate(String(e.message ?? "").trim(), 180),
      details: e.data ?? null,
    }));

  // Merge, sort, slice
  const merged = [...auditItems, ...signalItems, ...systemItems].sort((a, b) => {
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    if (bt !== at) return bt - at;
    return b.id.localeCompare(a.id);
  });

  const page = merged.slice(0, limit);
  const hasMore = merged.length > limit;

  const nextCursor = hasMore ? `${page[page.length - 1].createdAt}|${page[page.length - 1].id}` : null;

  return { items: page, nextCursor, summary };
}

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(items: ActivityItem[]) {
  const headers = ["timestamp", "kind", "title", "summary", "type", "level", "details_json"];

  const rows = items.map((it) => {
    const type = it.kind === "system_event" ? it.type : it.kind === "trade_decision" ? "strategy.signal" : "";
    const level = it.kind === "system_event" ? it.level : "";
    const detailsJson = it.details ? safeJson(it.details) : "";

    return [it.createdAt, it.kind, it.title, it.summary, type, level, detailsJson].map(csvEscape);
  });

  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.join(","))].join("\n");
}
