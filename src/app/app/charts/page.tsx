// src/app/app/charts/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { TradingChart } from "@/components/charts/TradingChart";

function fmtTime(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function toNum(n: any): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (n == null) return null;
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function fmtNum(n: any, dp = 2) {
  const x = toNum(n);
  if (x == null) return "–";
  return x.toFixed(dp);
}

function fmtInt(n: any) {
  const x = toNum(n);
  if (x == null) return "–";
  return String(Math.trunc(x));
}

function pillClass(_kind: "win" | "loss" | "be") {
  // keep it simple; your CSS already styles aura-pill nicely
  return "aura-pill";
}

function outcomeLabel(outcome: string) {
  if (outcome === "WIN") return "WIN";
  if (outcome === "LOSS") return "LOSS";
  if (outcome === "BREAKEVEN") return "BE";
  return outcome || "–";
}

function inferExitReason(pnlUsd: any) {
  const x = toNum(pnlUsd);
  if (x == null) return "UNKNOWN";
  if (x > 0) return "TP (inferred)";
  if (x < 0) return "SL (inferred)";
  return "BREAKEVEN (inferred)";
}

const LATE_STAGE_BLOCK_REASONS = [
  "IN_TRADE",
  "PAUSED",
  "KILL_SWITCH",
  "NOT_LIVE_CANDLE",
  "INVALID_BRACKET",
  "EXECUTION_FAILED",
  "STOP_INVALID",
  "STOP_TOO_BIG",
  "CONTRACTS_ZERO",

  // engine / near-miss reasons you already have in schema
  "NO_ACTIVE_FVG",
  "FVG_INVALID",
  "FVG_ALREADY_TRADED",
  "NOT_RETESTED",
  "DIRECTION_MISMATCH",
  "NO_EXPANSION_PATTERN",
] as const;

function prettyReason(s: { status: string; blockReason: any; meta: any }) {
  if (s.status === "TAKEN") return "Taken";

  const br = s.blockReason ? String(s.blockReason) : "";
  if (br) return br.replaceAll("_", " ");

  // fallback to meta fields if you ever store error text there
  const meta = s.meta ?? null;
  const metaErr =
    meta?.error ??
    meta?.err ??
    meta?.reason ??
    meta?.blockReason ??
    meta?.block_reason ??
    null;

  if (metaErr) return String(metaErr);
  return "Blocked";
}

export default async function ChartsPage() {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Recent closed trades (last 24h)
  const trades = await prisma.trade.findMany({
    where: { closedAt: { gte: since } },
    orderBy: { closedAt: "desc" },
    take: 250,
    select: {
      execKey: true,
      contractId: true,
      symbol: true,
      side: true,
      qty: true,
      openedAt: true,
      closedAt: true,
      durationSec: true,
      plannedStopTicks: true,
      plannedTakeProfitTicks: true,
      plannedRiskUsd: true,
      plannedRR: true,
      entryPriceAvg: true,
      exitPriceAvg: true,
      realizedPnlTicks: true,
      realizedPnlUsd: true,
      rrAchieved: true,
      exitReason: true,
      outcome: true,
    },
  });

  // “Aura considered” (signals) - show TAKEN + later-stage BLOCKED only (last 24h)
  const rawSignals = await prisma.strategySignal.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { status: "TAKEN" },
        { status: "BLOCKED", blockReason: { in: [...LATE_STAGE_BLOCK_REASONS] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      createdAt: true,
      strategy: true,
      symbol: true,
      contractId: true,
      side: true,
      status: true,
      blockReason: true,
      execKey: true,
      entryTime: true,
      fvgTime: true,
      stopTicks: true,
      tpTicks: true,
      rr: true,
      contracts: true,
      riskUsdPlanned: true,
      entryPrice: true,
      stopPrice: true,
      takeProfitPrice: true,
      meta: true,
      signalKey: true,
    },
  });

  // Dedupe signals by execKey when present (so TAKEN doesn’t spam)
  const signals = (() => {
    const seenExec = new Set<string>();
    const out: typeof rawSignals = [];
    for (const s of rawSignals) {
      if (s.execKey) {
        if (seenExec.has(s.execKey)) continue;
        seenExec.add(s.execKey);
      }
      out.push(s);
    }
    return out.slice(0, 250);
  })();

  // Only MGC chart
  const symbols = ["MGC"];

  return (
    <div className="aura-page">
      <div>
        <div className="aura-page-title">Charts</div>
        <div className="aura-page-subtitle">
          Live chart + trades + what Aura considered in the last 24 hours.{" "}
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>
      </div>

      {/* Recent Closed Trades (ABOVE charts) */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Recent Closed Trades</div>
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>

        <div className="aura-table aura-table-trades aura-mt-12">
          <div className="aura-table-header">
            <div>Closed</div>
            <div>Outcome</div>
            <div className="aura-right">PnL $</div>
            <div>Side</div>
            <div className="aura-right">Qty</div>
            <div>Contract</div>
            <div className="aura-right">SL (ticks)</div>
            <div className="aura-right">RR</div>
            <div>Exit</div>
            <div className="aura-right">Report</div>
          </div>

          {trades.length === 0 ? (
            <div className="aura-table-row">
              <div className="aura-muted">No trades in last 24h</div>
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
          ) : (
            trades.map((t) => {
              const out = outcomeLabel(t.outcome);
              const kind: "win" | "loss" | "be" =
                out === "WIN" ? "win" : out === "LOSS" ? "loss" : "be";

              const contract = t.contractId ?? t.symbol;

              const rr =
                t.rrAchieved != null
                  ? fmtNum(t.rrAchieved, 2)
                  : t.plannedRR != null
                  ? fmtNum(t.plannedRR, 2)
                  : "–";

              const exit =
                t.exitReason && t.exitReason !== "UNKNOWN"
                  ? t.exitReason
                  : inferExitReason(t.realizedPnlUsd);

              return (
                <details key={t.execKey} className="aura-details">
                  <summary className="aura-summary aura-table-row aura-row-link">
                    <div>{fmtTime(t.closedAt)}</div>
                    <div>
                      <span className={pillClass(kind)}>{out}</span>
                    </div>
                    <div className="aura-right">{fmtNum(t.realizedPnlUsd, 2)}</div>
                    <div>{t.side}</div>
                    <div className="aura-right">{fmtInt(t.qty)}</div>
                    <div>{contract}</div>
                    <div className="aura-right">{t.plannedStopTicks ?? "–"}</div>
                    <div className="aura-right">{rr}</div>
                    <div className="aura-muted">{exit}</div>
                    <div className="aura-right">
                      <Link
                        className="aura-link aura-btn aura-btn-subtle"
                        href={`/app/reports?execKey=${encodeURIComponent(t.execKey)}`}
                      >
                        View →
                      </Link>
                    </div>
                  </summary>

                  <div className="aura-expand aura-grid-gap-12">
                    <div className="aura-grid-4">
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Opened</div>
                        <div className="aura-mini-value">{fmtTime(t.openedAt)}</div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Duration</div>
                        <div className="aura-mini-value">
                          {t.durationSec != null ? `${fmtInt(t.durationSec)}s` : "–"}
                        </div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Entry → Exit</div>
                        <div className="aura-mini-value">
                          {fmtNum(t.entryPriceAvg, 2)} → {fmtNum(t.exitPriceAvg, 2)}
                        </div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Planned risk</div>
                        <div className="aura-mini-value">
                          {t.plannedRiskUsd != null ? `$${fmtNum(t.plannedRiskUsd, 2)}` : "–"}
                        </div>
                      </div>
                    </div>

                    <div className="aura-card-muted aura-grid-gap-10">
                      <div className="aura-text-xs aura-muted">
                        <span className="aura-mono">execKey</span>: {t.execKey}
                      </div>
                      <div className="aura-text-xs aura-muted">
                        Exit: {exit} - Side: {t.side} - Qty: {fmtInt(t.qty)}
                      </div>
                      <div className="aura-text-xs aura-muted">
                        Planned: SL {t.plannedStopTicks ?? "–"}t - TP {t.plannedTakeProfitTicks ?? "–"}t - RR{" "}
                        {t.plannedRR != null ? fmtNum(t.plannedRR, 2) : "–"}
                      </div>
                      <div className="aura-text-xs aura-muted">
                        Actual: {fmtInt(t.realizedPnlTicks)} ticks - ${fmtNum(t.realizedPnlUsd, 2)} - RR {rr}
                      </div>
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      </section>

      {/* Charts */}
      <section className="aura-grid-gap-12">
        {symbols.map((s) => (
          <div key={s} className="aura-card">
            <div className="aura-row-between">
              <div className="aura-card-title">{s}</div>
              <Link className="aura-link aura-btn aura-btn-subtle" href={`/app/reports?symbol=${encodeURIComponent(s)}`}>
                Report →
              </Link>
            </div>
            <TradingChart symbol={s} initialTf="15s" channelName={null} />
          </div>
        ))}
      </section>

      {/* Aura considered (signals) */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Aura considered (TAKEN + later-stage blocked - last 24h)</div>
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>

        <div className="aura-table aura-table-signals aura-mt-12">
          <div className="aura-table-header">
            <div>Time</div>
            <div>Strategy</div>
            <div>Instrument</div>
            <div>Side</div>
            <div>Status</div>
            <div className="aura-hide-sm">Reason</div>
            <div className="aura-right">SL/TP</div>
            <div className="aura-right">RR</div>
            <div className="aura-right">Contracts</div>
            <div className="aura-right">Risk $</div>
            <div className="aura-right">Report</div>
          </div>

          {signals.length === 0 ? (
            <div className="aura-table-row">
              <div className="aura-muted">No later-stage evaluated setups yet</div>
              <div />
              <div />
              <div />
              <div />
              <div className="aura-hide-sm" />
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
          ) : (
            signals.map((s) => {
              const statusLabel = s.status === "TAKEN" ? "TAKEN" : "BLOCKED";
              const reason = prettyReason({ status: s.status, blockReason: s.blockReason, meta: s.meta });

              const instrument = s.contractId ?? s.symbol;

              const reportHref = s.execKey
                ? `/app/reports?execKey=${encodeURIComponent(s.execKey)}`
                : `/app/reports?signalKey=${encodeURIComponent(s.signalKey)}`;

              return (
                <details key={s.signalKey} className="aura-details">
                  <summary className="aura-summary aura-table-row aura-row-link">
                    <div>{fmtTime(s.createdAt)}</div>
                    <div>{s.strategy}</div>
                    <div>{instrument}</div>
                    <div>{s.side}</div>
                    <div>
                      <span className="aura-pill">{statusLabel}</span>
                    </div>
                    <div className="aura-hide-sm aura-muted">{reason}</div>
                    <div className="aura-right">
                      {s.stopTicks != null ? fmtNum(s.stopTicks, 0) : "–"} / {s.tpTicks != null ? fmtNum(s.tpTicks, 0) : "–"}
                    </div>
                    <div className="aura-right">{s.rr != null ? fmtNum(s.rr, 2) : "–"}</div>
                    <div className="aura-right">{s.contracts != null ? fmtInt(s.contracts) : "–"}</div>
                    <div className="aura-right">{s.riskUsdPlanned != null ? fmtNum(s.riskUsdPlanned, 2) : "–"}</div>
                    <div className="aura-right">
                      <Link className="aura-link aura-btn aura-btn-subtle" href={reportHref}>
                        View →
                      </Link>
                    </div>
                  </summary>

                  <div className="aura-expand aura-grid-gap-12">
                    <div className="aura-grid-4">
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Entry / Stop / TP</div>
                        <div className="aura-mini-value">
                          {s.entryPrice != null ? fmtNum(s.entryPrice, 2) : "–"} /{" "}
                          {s.stopPrice != null ? fmtNum(s.stopPrice, 2) : "–"} /{" "}
                          {s.takeProfitPrice != null ? fmtNum(s.takeProfitPrice, 2) : "–"}
                        </div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Entry time</div>
                        <div className="aura-mini-value">{s.entryTime != null ? String(s.entryTime) : "–"}</div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">FVG time</div>
                        <div className="aura-mini-value">{s.fvgTime != null ? String(s.fvgTime) : "–"}</div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Block reason</div>
                        <div className="aura-mini-value">{s.blockReason ? String(s.blockReason).replaceAll("_", " ") : "–"}</div>
                      </div>
                    </div>

                    <div className="aura-card-muted aura-grid-gap-10">
                      <div className="aura-text-xs aura-muted">
                        <span className="aura-mono">signalKey</span>: {s.signalKey}
                      </div>

                      {s.execKey ? (
                        <div className="aura-text-xs aura-muted">
                          <span className="aura-mono">execKey</span>: {s.execKey}
                        </div>
                      ) : null}

                      <details>
                        <summary className="aura-summary aura-text-xs aura-muted aura-row-link">Raw meta</summary>
                        <pre className="aura-card-muted aura-text-xs aura-mt-10" style={{ overflow: "auto" }}>
{JSON.stringify(s.meta ?? null, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
