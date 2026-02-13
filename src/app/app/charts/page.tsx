// src/app/app/charts/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { TradingChart } from "@/components/charts/TradingChart";

function fmtTime(d: Date) {
  // simple + predictable (no locale surprises)
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function fmtNum(n: any, dp = 2) {
  const x = typeof n === "number" ? n : n != null ? Number(n) : null;
  if (x == null || Number.isNaN(x)) return "–";
  return x.toFixed(dp);
}

function fmtInt(n: any) {
  const x = typeof n === "number" ? n : n != null ? Number(n) : null;
  if (x == null || Number.isNaN(x)) return "–";
  return String(Math.trunc(x));
}

function pillClass(kind: "win" | "loss" | "be") {
  if (kind === "win") return "aura-pill";
  if (kind === "loss") return "aura-pill";
  return "aura-pill";
}

function outcomeLabel(outcome: string) {
  if (outcome === "WIN") return "WIN";
  if (outcome === "LOSS") return "LOSS";
  if (outcome === "BREAKEVEN") return "BE";
  return outcome || "–";
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
] as const;

export default async function ChartsPage() {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Trades (last 24h) - already unique by execKey in schema
  const trades = await prisma.trade.findMany({
    where: { closedAt: { gte: since } },
    orderBy: { closedAt: "desc" },
    take: 200,
    select: {
      execKey: true,
      symbol: true,
      contractId: true,
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

  // Strategy Signals (last 24h) - dedupe by execKey (when present)
  const rawSignals = await prisma.strategySignal.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { status: "TAKEN" },
        { status: "BLOCKED", blockReason: { in: [...LATE_STAGE_BLOCK_REASONS] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: {
      createdAt: true,
      strategy: true,
      symbol: true,
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
    return out.slice(0, 200);
  })();

  // NOTE: symbol list for charts section (keep simple)
  const symbols = ["MGC", "GC"];

  return (
    <div className="aura-page">
      <div>
        <div className="aura-page-title">Charts</div>
        <div className="aura-page-subtitle">
          Live chart + last 24h trades and later-stage evaluated setups.{" "}
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>
      </div>

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

      {/* Trades table */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Trades (last 24h)</div>
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>

        <div className="aura-table aura-table-trades aura-mt-12">
          <div className="aura-table-header">
            <div>Closed</div>
            <div>Symbol</div>
            <div>Outcome</div>
            <div className="aura-right">RR</div>
            <div className="aura-right">PnL $</div>
            <div className="aura-hide-sm">Details</div>
            <div className="aura-right">Report</div>
          </div>

          {trades.length === 0 ? (
            <div className="aura-table-row">
              <div className="aura-muted">No trades in last 24h</div>
              <div />
              <div />
              <div />
              <div />
              <div className="aura-hide-sm" />
              <div />
            </div>
          ) : (
            trades.map((t) => {
              const out = outcomeLabel(t.outcome);
              const kind: "win" | "loss" | "be" =
                out === "WIN" ? "win" : out === "LOSS" ? "loss" : "be";

              return (
                <details key={t.execKey} className="aura-details">
                  <summary className="aura-summary aura-table-row aura-row-link">
                    <div>{fmtTime(t.closedAt)}</div>
                    <div>{t.symbol}</div>
                    <div>
                      <span className={pillClass(kind)}>{out}</span>
                    </div>
                    <div className="aura-right">{t.rrAchieved != null ? fmtNum(t.rrAchieved, 2) : "–"}</div>
                    <div className="aura-right">{fmtNum(t.realizedPnlUsd, 2)}</div>
                    <div className="aura-hide-sm aura-muted">
                      {t.side} {fmtNum(t.qty, 0)} - SL {t.plannedStopTicks ?? "–"}t - TP{" "}
                      {t.plannedTakeProfitTicks ?? "–"}t
                    </div>
                    <div className="aura-right">
                      <Link className="aura-link aura-btn aura-btn-subtle" href={`/app/reports?execKey=${encodeURIComponent(t.execKey)}`}>
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
                          ${t.plannedRiskUsd != null ? fmtNum(t.plannedRiskUsd, 2) : "–"}
                        </div>
                      </div>
                    </div>

                    <div className="aura-card-muted aura-grid-gap-10">
                      <div className="aura-text-xs aura-muted">
                        <span className="aura-mono">execKey</span>: {t.execKey}
                      </div>
                      <div className="aura-text-xs aura-muted">
                        Exit: {t.exitReason} - Side: {t.side} - Qty: {fmtNum(t.qty, 0)}
                      </div>
                      <div className="aura-text-xs aura-muted">
                        Planned: SL {t.plannedStopTicks ?? "–"}t - TP {t.plannedTakeProfitTicks ?? "–"}t - RR{" "}
                        {t.plannedRR != null ? fmtNum(t.plannedRR, 2) : "–"}
                      </div>
                      <div className="aura-text-xs aura-muted">
                        Actual: {fmtInt(t.realizedPnlTicks)} ticks - ${fmtNum(t.realizedPnlUsd, 2)} - RR{" "}
                        {t.rrAchieved != null ? fmtNum(t.rrAchieved, 2) : "–"}
                      </div>
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      </section>

      {/* Signals table */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Evaluated setups (later-stage only - last 24h)</div>
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>

        <div className="aura-table aura-table-signals aura-mt-12">
          <div className="aura-table-header">
            <div>Time</div>
            <div>Status</div>
            <div>Side</div>
            <div className="aura-hide-sm">Reason / details</div>
            <div className="aura-right">Report</div>
          </div>

          {signals.length === 0 ? (
            <div className="aura-table-row">
              <div className="aura-muted">No later-stage setups yet (needs an active retested FVG window)</div>
              <div />
              <div />
              <div className="aura-hide-sm" />
              <div />
            </div>
          ) : (
            signals.map((s) => {
              const statusLabel = s.status === "TAKEN" ? "TAKEN" : "BLOCKED";
              const reason =
                s.status === "TAKEN"
                  ? "Taken"
                  : s.blockReason
                  ? String(s.blockReason).replaceAll("_", " ")
                  : "Blocked";

              const reportHref = s.execKey
                ? `/app/reports?execKey=${encodeURIComponent(s.execKey)}`
                : `/app/reports?signalKey=${encodeURIComponent(s.signalKey)}`;

              return (
                <details key={s.signalKey} className="aura-details">
                  <summary className="aura-summary aura-table-row aura-row-link">
                    <div>{fmtTime(s.createdAt)}</div>
                    <div>
                      <span className="aura-pill">{statusLabel}</span>
                    </div>
                    <div>{s.side}</div>
                    <div className="aura-hide-sm aura-muted">
                      {s.strategy} - {s.symbol} - {reason}
                    </div>
                    <div className="aura-right">
                      <Link className="aura-link aura-btn aura-btn-subtle" href={reportHref}>
                        View →
                      </Link>
                    </div>
                  </summary>

                  <div className="aura-expand aura-grid-gap-12">
                    <div className="aura-grid-4">
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Stop / TP</div>
                        <div className="aura-mini-value">
                          {s.stopTicks != null ? fmtNum(s.stopTicks, 0) : "–"}t /{" "}
                          {s.tpTicks != null ? fmtNum(s.tpTicks, 0) : "–"}t
                        </div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">RR planned</div>
                        <div className="aura-mini-value">{s.rr != null ? fmtNum(s.rr, 2) : "–"}</div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Contracts</div>
                        <div className="aura-mini-value">{s.contracts != null ? fmtInt(s.contracts) : "–"}</div>
                      </div>
                      <div className="aura-card-muted">
                        <div className="aura-stat-label">Risk planned</div>
                        <div className="aura-mini-value">{s.riskUsdPlanned != null ? `$${fmtNum(s.riskUsdPlanned, 2)}` : "–"}</div>
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

                      <div className="aura-text-xs aura-muted">
                        Prices: entry {s.entryPrice != null ? fmtNum(s.entryPrice, 2) : "–"} - stop{" "}
                        {s.stopPrice != null ? fmtNum(s.stopPrice, 2) : "–"} - tp{" "}
                        {s.takeProfitPrice != null ? fmtNum(s.takeProfitPrice, 2) : "–"}
                      </div>

                      <div className="aura-text-xs aura-muted">
                        Block reason: {s.blockReason ? String(s.blockReason) : "–"}
                      </div>

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
