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

function pillClass(_kind: "win" | "loss" | "be") {
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

  // Strategy Signals (last 24h) — TAKEN + real “setup candidate” BLOCKED rows
  // Excludes the noisy “heartbeat/every candle” reasons.
  const SETUP_BLOCK_REASONS = [
    "FVG_INVALID",
    "FVG_ALREADY_TRADED",
    "NOT_RETESTED",
    "DIRECTION_MISMATCH",
    "STOP_INVALID",
    "STOP_TOO_BIG",
    "CONTRACTS_ZERO",

    // these are “late stage” operational blocks (still worth showing)
    "IN_TRADE",
    "PAUSED",
    "KILL_SWITCH",
    "NOT_LIVE_CANDLE",
    "INVALID_BRACKET",
    "EXECUTION_FAILED",
  ] as const;

  const rawSignals = await prisma.strategySignal.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { status: "TAKEN" },
        {
          status: "BLOCKED",
          blockReason: { in: SETUP_BLOCK_REASONS as any },
        },
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

  // Keep most recent 200. Do NOT dedupe by execKey.
  const signals = rawSignals.slice(0, 200);

  // only MGC chart
  const symbols = ["MGC"];

  // Fixed grid column layouts to stop wrapping + stop giant empty gaps
  const tradesGrid = {
    display: "grid",
    gridTemplateColumns:
      "190px 95px 90px 70px 110px 260px 150px 110px 80px",
    alignItems: "center",
    columnGap: 16,
    whiteSpace: "nowrap" as const,
  };

  const setupsGrid = {
    display: "grid",
    gridTemplateColumns:
      "190px 140px 260px 70px 110px 320px 140px 80px 110px 110px",
    alignItems: "center",
    columnGap: 16,
    whiteSpace: "nowrap" as const,
  };

  const cellEllipsis = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  };

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
        <div
          className="aura-mt-12"
          style={{
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* minWidth MUST be wider than container to force scrollbar */}
          <div style={{ minWidth: 1160 }}>
            <div className="aura-table">
              <div className="aura-table-header" style={tradesGrid}>
                <div style={cellEllipsis}>Closed</div>
                <div style={cellEllipsis}>Outcome</div>
                <div className="aura-right" style={cellEllipsis}>
                  PnL $
                </div>
                <div style={cellEllipsis}>Side</div>
                <div className="aura-right" style={cellEllipsis}>
                  # Contracts
                </div>
                <div style={cellEllipsis}>Contract</div>
                <div className="aura-right" style={cellEllipsis}>
                  Stop Loss (ticks)
                </div>
                <div className="aura-right" style={cellEllipsis}>
                  Risk $
                </div>
                <div className="aura-right" style={cellEllipsis}>
                  RR
                </div>
              </div>

              {trades.length === 0 ? (
                <div className="aura-table-row" style={tradesGrid}>
                  <div className="aura-muted" style={cellEllipsis}>
                    No trades in last 24h
                  </div>
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

                  const riskUsd =
                    t.plannedRiskUsd != null ? Number(t.plannedRiskUsd) : null;
                  const rrPlanned =
                    t.plannedRR != null ? Number(t.plannedRR) : null;

                  return (
                    <div key={t.execKey} className="aura-table-row" style={tradesGrid}>
                      <div style={cellEllipsis}>{fmtTime(t.closedAt)}</div>
                      <div style={cellEllipsis}>
                        <span className={pillClass(kind)}>{out}</span>
                      </div>
                      <div className="aura-right" style={cellEllipsis}>
                        {fmtNum(t.realizedPnlUsd, 2)}
                      </div>
                      <div style={cellEllipsis}>{t.side}</div>
                      <div className="aura-right" style={cellEllipsis}>
                        {t.qty != null ? fmtInt(t.qty) : "–"}
                      </div>
                      <div style={cellEllipsis}>{contract}</div>
                      <div className="aura-right" style={cellEllipsis}>
                        {t.plannedStopTicks != null ? fmtInt(t.plannedStopTicks) : "–"}
                      </div>
                      <div className="aura-right" style={cellEllipsis}>
                        {riskUsd != null ? fmtNum(riskUsd, 2) : "–"}
                      </div>
                      <div className="aura-right" style={cellEllipsis}>
                        {rrPlanned != null ? fmtNum(rrPlanned, 2) : "–"}
                      </div>
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
        <div
          className="aura-mt-12"
          style={{
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div style={{ minWidth: 1500 }}>
            <div className="aura-table">
              <div className="aura-table-header" style={setupsGrid}>
                <div style={cellEllipsis}>Time</div>
                <div style={cellEllipsis}>Strategy</div>
                <div style={cellEllipsis}>Instrument</div>
                <div style={cellEllipsis}>Side</div>
                <div style={cellEllipsis}>Status</div>
                <div style={cellEllipsis}>Reason</div>
                <div className="aura-right" style={cellEllipsis}>
                  SL/TP (ticks)
                </div>
                <div className="aura-right" style={cellEllipsis}>
                  RR
                </div>
                <div className="aura-right" style={cellEllipsis}>
                  # Contracts
                </div>
                <div className="aura-right" style={cellEllipsis}>
                  Risk $
                </div>
              </div>

              {signals.length === 0 ? (
                <div className="aura-table-row" style={setupsGrid}>
                  <div className="aura-muted" style={cellEllipsis}>
                    No later-stage setups yet
                  </div>
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
                    <div key={s.signalKey} className="aura-table-row" style={setupsGrid}>
                      <div style={cellEllipsis}>{fmtTime(s.createdAt)}</div>
                      <div style={cellEllipsis}>{s.strategy}</div>
                      <div style={cellEllipsis}>{instrument}</div>
                      <div style={cellEllipsis}>{s.side}</div>
                      <div style={cellEllipsis}>
                        <span className="aura-pill">{statusLabel}</span>
                      </div>
                      <div className="aura-muted" style={cellEllipsis}>
                        {reason.toUpperCase()}
                      </div>
                      <div className="aura-right" style={cellEllipsis}>
                        {s.stopTicks != null ? fmtInt(s.stopTicks) : "–"} /{" "}
                        {s.tpTicks != null ? fmtInt(s.tpTicks) : "–"}
                      </div>
                      <div className="aura-right" style={cellEllipsis}>
                        {s.rr != null ? fmtNum(s.rr, 2) : "–"}
                      </div>
                      <div className="aura-right" style={cellEllipsis}>
                        {s.contracts != null ? fmtInt(s.contracts) : "–"}
                      </div>
                      <div className="aura-right" style={cellEllipsis}>
                        {s.riskUsdPlanned != null ? fmtNum(s.riskUsdPlanned, 2) : "–"}
                      </div>
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
