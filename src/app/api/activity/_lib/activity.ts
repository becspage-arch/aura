// src/app/api/activity/_lib/activity.ts
import { prisma } from "@/lib/prisma";

export type ActivityScope = "user" | "user+aura" | "all";
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
  IN_TRADE: "In trade",
  PAUSED: "Paused",
  KILL_SWITCH: "Kill switch",
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
  if (type === "market.quote") return true;
  if (type.startsWith("candle_")) return true;
  return false;
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

export async function fetchActivity(params: {
  userId: string; // internal UserProfile.id
  scope: ActivityScope;
  q: string | null;
  limit: number;
  cursor: string | null;
}) {
  const { userId } = params;
  const limit = Math.max(1, Math.min(100, params.limit));
  const q = (params.q || "").trim();
  const cursor = parseCursor(params.cursor);

  // Pull a bit extra from each source so merge/sort has enough
  const perSourceTake = Math.min(200, limit * 4);

  const includeAura = params.scope === "user+aura" || params.scope === "all";
  const includeSystem = params.scope === "all";

  const auditPromise = prisma.auditLog.findMany({
    where: {
      userId,
      ...(cursorWhere(cursor) as any),
      ...(q
        ? {
            OR: [
              { action: { contains: q, mode: "insensitive" } },
              // data is JSON so we can't "contains" reliably - skip for now
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: perSourceTake,
  });

  const signalsPromise = includeAura
    ? prisma.strategySignal.findMany({
        where: {
          userId,
          ...(cursorWhere(cursor) as any),
          ...(q
            ? {
                OR: [
                  { symbol: { contains: q, mode: "insensitive" } },
                  { strategy: { contains: q, mode: "insensitive" } },
                  // status / blockReason are enums - equals only is safest:
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

  const auditItems: ActivityItem[] = audit.map((a) => ({
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

    const title = `Aura evaluation • ${s.symbol}`;
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
    .filter((e) => !isHeartbeatLike(String(e.type), e.message))
    .map((e) => ({
      kind: "system_event",
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      level: String(e.level ?? "info"),
      type: String(e.type ?? ""),
      title: `System • ${String(e.type ?? "")}`,
      summary: truncate(String(e.message ?? "").trim(), 180),
      details: e.data ?? null,
    }));

  // Merge, sort, slice
  const merged = [...auditItems, ...signalItems, ...systemItems].sort((a, b) => {
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    if (bt !== at) return bt - at;
    // stable tie-breaker by id desc
    return b.id.localeCompare(a.id);
  });

  const page = merged.slice(0, limit);
  const hasMore = merged.length > limit;

  const nextCursor = hasMore
    ? `${page[page.length - 1].createdAt}|${page[page.length - 1].id}`
    : null;

  return { items: page, nextCursor };
}

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(items: ActivityItem[]) {
  const headers = [
    "timestamp",
    "kind",
    "title",
    "summary",
    "type",
    "level",
    "details_json",
  ];

  const rows = items.map((it) => {
    const type = it.kind === "system_event" ? it.type : it.kind === "aura_eval" ? "strategy.signal" : "";
    const level = it.kind === "system_event" ? it.level : "";
    const detailsJson = it.details ? safeJson(it.details) : "";

    return [
      it.createdAt,
      it.kind,
      it.title,
      it.summary,
      type,
      level,
      detailsJson,
    ].map(csvEscape);
  });

  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.join(","))].join("\n");
}
