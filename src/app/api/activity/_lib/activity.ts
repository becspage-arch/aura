// src/app/api/activity/_lib/activity.ts
import { prisma } from "@/lib/prisma";

export type SystemPreset = "important" | "errors" | "settings" | "all";

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
      kind: "aura_eval";
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

export type ActivitySummary = {
  tradeOpportunities: number;
  tradesEntered: number;
  skipped: number;
  systemIssues: number;
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

const BLOCK_REASON_LABEL: Record<string, string> = {
  IN_TRADE: "Already in a trade",
  PAUSED: "Paused",
  KILL_SWITCH: "Kill switch on",
  NOT_LIVE_CANDLE: "Not a live candle",
  INVALID_BRACKET: "Invalid bracket",
  EXECUTION_FAILED: "Execution failed",
  OUTSIDE_TRADING_WINDOWS: "Outside trading hours",

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
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

function parseDateOrNull(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function createdAtRangeWhere(params: { from?: string | null; to?: string | null }) {
  const fromD = parseDateOrNull(params.from ?? null);
  const toD = parseDateOrNull(params.to ?? null);

  if (!fromD && !toD) return undefined;

  const w: any = {};
  if (fromD) w.gte = fromD;
  if (toD) w.lte = toD;
  return { createdAt: w };
}

export async function fetchActivity(params: {
  userId: string;

  q: string | null;
  limit: number;
  cursor: string | null;

  // checkboxes
  includeMyActivity: boolean;
  includeTradeDecisions: boolean;
  includeAccountSystem: boolean;

  // system filter (only used if includeAccountSystem === true)
  systemPreset?: SystemPreset;

  // date range (ISO)
  from?: string | null;
  to?: string | null;
}) {
  const { userId } = params;

  const limit = Math.max(1, Math.min(100, params.limit));
  const q = (params.q || "").trim();
  const cursor = parseCursor(params.cursor);

  const includeMyActivity = !!params.includeMyActivity;
  const includeTradeDecisions = !!params.includeTradeDecisions;
  const includeAccountSystem = !!params.includeAccountSystem;

  const systemPreset: SystemPreset = params.systemPreset ?? "important";

  // Pull extra per source so merge/sort has enough
  const perSourceTake = Math.min(250, limit * 5);

  const createdAtWhere = createdAtRangeWhere({ from: params.from ?? null, to: params.to ?? null });

  const auditPromise = includeMyActivity
    ? prisma.auditLog.findMany({
        where: {
          userId,
          ...(createdAtWhere as any),
          ...(cursorWhere(cursor) as any),
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

  const signalsPromise = includeTradeDecisions
    ? prisma.strategySignal.findMany({
        where: {
          userId,
          ...(createdAtWhere as any),
          ...(cursorWhere(cursor) as any),
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

  const systemPromise = includeAccountSystem
    ? prisma.eventLog.findMany({
        where: {
          userId,
          ...(createdAtWhere as any),
          ...(cursorWhere(cursor) as any),
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

  const [audit, signals, systemRaw] = await Promise.all([auditPromise, signalsPromise, systemPromise]);

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

    const decisionLabel = entered ? "Trade entered" : skipped ? "Skipped" : "Opportunity found";
    const reason = skipped ? labelBlockReason(br) : "";

    const title = `Trade decision • ${s.symbol}`;
    const summary =
      skipped && reason
        ? `${decisionLabel} - ${reason}`
        : entered
          ? `${decisionLabel} - ${s.side} • ${s.contracts ?? "—"} contracts`
          : `${decisionLabel} - ${s.side}`;

    return {
      kind: "aura_eval",
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      title,
      summary: truncate(summary, 180),
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

  // Summary cards (based on the same filters / date range, but independent of pagination)
  const summaryWhereSignals: any = {
    userId,
    ...(createdAtWhere as any),
  };

  const summaryWhereSystem: any = {
    userId,
    ...(createdAtWhere as any),
    // only count non-noisy system issues
    NOT: [
      { type: "market.quote" },
      { type: "worker_heartbeat" },
      { type: { startsWith: "candle_" } },
    ],
    level: { in: ["warn", "error"] },
  };

  const [tradeOpportunities, tradesEntered, skipped, systemIssues] = await Promise.all([
    includeTradeDecisions ? prisma.strategySignal.count({ where: summaryWhereSignals }) : Promise.resolve(0),
    includeTradeDecisions ? prisma.strategySignal.count({ where: { ...summaryWhereSignals, status: "TAKEN" } as any }) : Promise.resolve(0),
    includeTradeDecisions ? prisma.strategySignal.count({ where: { ...summaryWhereSignals, status: "BLOCKED" } as any }) : Promise.resolve(0),
    includeAccountSystem ? prisma.eventLog.count({ where: summaryWhereSystem }) : Promise.resolve(0),
  ]);

  const summary: ActivitySummary = {
    tradeOpportunities,
    tradesEntered,
    skipped,
    systemIssues,
  };

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
    const type = it.kind === "system_event" ? it.type : it.kind === "aura_eval" ? "strategy.signal" : "";
    const level = it.kind === "system_event" ? it.level : "";
    const detailsJson = it.details ? safeJson(it.details) : "";

    return [it.createdAt, it.kind, it.title, it.summary, type, level, detailsJson].map(csvEscape);
  });

  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.join(","))].join("\n");
}
