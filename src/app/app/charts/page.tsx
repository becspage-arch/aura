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

function outcomeLabel(outcome: string) {
  if (outcome === "WIN") return "WIN";
  if (outcome === "LOSS") return "LOSS";
  if (outcome === "BREAKEVEN") return "BE";
  return outcome || "–";
}

function pillClass(kind: "win" | "loss" | "be") {
  // keep your existing pill styles
  return "aura-pill";
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

  // Trades (last 24h)
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
      closedAt: true,
      realizedPnlUsd: true,
      outcome: true,

      plannedStopTicks: true,
      plannedRiskUsd: true,
      plannedRR: true,
    },
  });

  // Strategy Signals (last 24h)
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
      contractId: true,
      side: true,
      status: true,
      blockReason: true,
      execKey: true,
      stopTicks: true,
      tpTicks: true,
      rr: true,
      contracts: true,
      riskUsdPlanned: true,
      signalKey: true,
    },
  });

  // Dedupe signals by execKey when present
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

  // only MGC chart
  const symbols = ["MGC"];

  return (
    <div className="aura-page">
      <div>
        <div className="aura-page-title">Charts</div>
        <div className="aura-page-subtitle">
          Live chart + last 24h trades + evaluated setups.
        </div>
      </div>

      {/* Chart (MGC) */}
      <section className="aura-grid-gap-12">
        {symbols.map((s) => (
          <div key={s} className="aura-card">
            <div className="aura-row-between">
              <div className="aura-card-title">{s}</div>
              <Link
                className="aura-link aura-btn aura-btn-subtle"
                href={`/app/reports?symbol=${encodeURIComponent(s)}`}
              >
                View full report →
              </Link>
            </div>
            <TradingChart symbol={s} initialTf="15s" channelName={null} />
          </div>
        ))}
      </section>

      {/* Recent Trades */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Recent Trades (last 24h)</div>
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>

        {/* Horizontal scroll + no wrapping */}
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ minWidth: 980 }}>
            <div className="aura-table aura-mt-12">
              <div className="aura-table-header" style={{ whiteSpace: "nowrap" }}>
                <div>Closed</div>
                <div>Outcome</div>
                <div className="aura-right">PnL $</div>
                <div>Side</div>
                <div className="aura-right"># Contracts</div>
                <div>Contract</div>
                <div className="aura-right">Stop Loss (ticks)</div>
                <div className="aura-right">Risk $</div>
                <div className="aura-right">RR</div>
              </div>

              {trades.length === 0 ? (
                <div className="aura-table-row" style={{ whiteSpace: "nowrap" }}>
                  <div className="aura-muted">No trades in last 24h</div>
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

                  const contract = t.contractId || t.symbol;

                  // risk/rr come from planned fields written by the worker
                  const riskUsd = t.plannedRiskUsd != null ? Number(t.plannedRiskUsd) : null;
                  const rrPlanned = t.plannedRR != null ? Number(t.plannedRR) : null;

                  return (
                    <div key={t.execKey} className="aura-table-row" style={{ whiteSpace: "nowrap" }}>
                      <div>{fmtTime(t.closedAt)}</div>
                      <div>
                        <span className={pillClass(kind)}>{out}</span>
                      </div>
                      <div className="aura-right">{fmtNum(t.realizedPnlUsd, 2)}</div>
                      <div>{t.side}</div>
                      <div className="aura-right">{t.qty != null ? fmtInt(t.qty) : "–"}</div>
                      <div>{contract}</div>
                      <div className="aura-right">{t.plannedStopTicks != null ? fmtInt(t.plannedStopTicks) : "–"}</div>
                      <div className="aura-right">{riskUsd != null ? fmtNum(riskUsd, 2) : "–"}</div>
                      <div className="aura-right">{rrPlanned != null ? fmtNum(rrPlanned, 2) : "–"}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Setups Reviewed */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Setups Reviewed (last 24h)</div>
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>

        {/* Horizontal scroll + no wrapping */}
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ minWidth: 1050 }}>
            <div className="aura-table aura-mt-12">
              <div className="aura-table-header" style={{ whiteSpace: "nowrap" }}>
                <div>Time</div>
                <div>Strategy</div>
                <div>Instrument</div>
                <div>Side</div>
                <div>Status</div>
                <div>Reason</div>
                <div className="aura-right">SL/TP (ticks)</div>
                <div className="aura-right">RR</div>
                <div className="aura-right"># Contracts</div>
                <div className="aura-right">Risk $</div>
              </div>

              {signals.length === 0 ? (
                <div className="aura-table-row" style={{ whiteSpace: "nowrap" }}>
                  <div className="aura-muted">No later-stage setups yet</div>
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
                signals.map((s) => {
                  const statusLabel = s.status === "TAKEN" ? "TAKEN" : "BLOCKED";
                  const reason =
                    s.status === "TAKEN"
                      ? "Taken"
                      : s.blockReason
                      ? String(s.blockReason).replaceAll("_", " ")
                      : "Blocked";

                  const instrument = s.contractId || s.symbol;

                  return (
                    <div key={s.signalKey} className="aura-table-row" style={{ whiteSpace: "nowrap" }}>
                      <div>{fmtTime(s.createdAt)}</div>
                      <div>{s.strategy}</div>
                      <div>{instrument}</div>
                      <div>{s.side}</div>
                      <div>
                        <span className="aura-pill">{statusLabel}</span>
                      </div>
                      <div className="aura-muted">{reason.toUpperCase()}</div>
                      <div className="aura-right">
                        {s.stopTicks != null ? fmtInt(s.stopTicks) : "–"} / {s.tpTicks != null ? fmtInt(s.tpTicks) : "–"}
                      </div>
                      <div className="aura-right">{s.rr != null ? fmtNum(s.rr, 2) : "–"}</div>
                      <div className="aura-right">{s.contracts != null ? fmtInt(s.contracts) : "–"}</div>
                      <div className="aura-right">{s.riskUsdPlanned != null ? fmtNum(s.riskUsdPlanned, 2) : "–"}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
