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
  if (n == null) return null;
  if (typeof n === "number") return Number.isFinite(n) ? n : null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
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

function pillClass() {
  return "aura-pill";
}

function outcomeLabel(outcome: string) {
  if (outcome === "WIN") return "WIN";
  if (outcome === "LOSS") return "LOSS";
  if (outcome === "BREAKEVEN") return "BE";
  return outcome || "–";
}

function statusLabel(status: string) {
  if (status === "TAKEN") return "TAKEN";
  if (status === "BLOCKED") return "BLOCKED";
  return status || "–";
}

function reasonLabel(blockReason: string | null | undefined) {
  if (!blockReason) return "–";
  return String(blockReason).replaceAll("_", " ");
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
  // engine/near-miss
  "NO_ACTIVE_FVG",
  "FVG_INVALID",
  "FVG_ALREADY_TRADED",
  "NOT_RETESTED",
  "DIRECTION_MISMATCH",
  "NO_EXPANSION_PATTERN",
] as const;

export default async function ChartsPage() {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // --- Recent trades (last 24h) ---
  const trades = await prisma.trade.findMany({
    where: { closedAt: { gte: since } },
    orderBy: { closedAt: "desc" },
    take: 200,
    select: {
      execKey: true,
      contractId: true,
      symbol: true,
      side: true,
      qty: true,
      closedAt: true,
      plannedStopTicks: true,
      plannedRiskUsd: true,
      plannedRR: true,
      realizedPnlUsd: true,
      rrAchieved: true,
      outcome: true,
      exitReason: true,
    },
  });

  // --- “Aura setups” (taken + later-stage blocked) ---
  const rawSignals = await prisma.strategySignal.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { status: "TAKEN" },
        { status: "BLOCKED", blockReason: { in: [...LATE_STAGE_BLOCK_REASONS] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 600,
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
      meta: true,
    },
  });

  // Dedupe by execKey (when present) so reconnect spam doesn’t flood this view
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

  const contractForTrade = (t: (typeof trades)[number]) =>
    (t.contractId && String(t.contractId).trim()) ? String(t.contractId) : String(t.symbol);

  // MGC chart only
  const symbols = ["MGC"];

  return (
    <div className="aura-page">
      <div>
        <div className="aura-page-title">Charts</div>
        <div className="aura-page-subtitle">
          Live chart + recent trade outcomes + what Aura evaluated (taken or blocked).
        </div>
      </div>

      {/* 1) Chart FIRST */}
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

      {/* 2) Recent Trades table SECOND */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Recent Trades (last 24h)</div>
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>

        <div className="aura-mt-12" style={{ overflowX: "auto" }}>
          <div className="aura-table aura-table-trades" style={{ minWidth: 1100 }}>
            <div className="aura-table-header" style={{ whiteSpace: "nowrap" }}>
              <div>Closed</div>
              <div>Outcome</div>
              <div className="aura-right">PnL $</div>
              <div>Side</div>
              <div className="aura-right"># Contracts</div>
              <div>Contract</div>
              <div className="aura-right">Stop (ticks)</div>
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

                const contracts = toNum(t.qty);
                const stopTicks = toNum(t.plannedStopTicks);
                const riskUsd = toNum(t.plannedRiskUsd);

                // Prefer rrAchieved if you’ve got it; otherwise fall back to plannedRR;
                // otherwise if we have planned risk, compute achieved R = pnl / risk.
                const rr =
                  toNum(t.rrAchieved) ??
                  toNum(t.plannedRR) ??
                  (riskUsd && riskUsd !== 0 ? (toNum(t.realizedPnlUsd) ?? 0) / riskUsd : null);

                return (
                  <div key={t.execKey} className="aura-table-row" style={{ whiteSpace: "nowrap" }}>
                    <div>{fmtTime(t.closedAt)}</div>
                    <div>
                      <span className={pillClass()}>{out}</span>
                    </div>
                    <div className="aura-right">{fmtNum(t.realizedPnlUsd, 2)}</div>
                    <div>{t.side}</div>
                    <div className="aura-right">{contracts != null ? fmtInt(contracts) : "–"}</div>
                    <div className="aura-mono">{contractForTrade(t)}</div>
                    <div className="aura-right">{stopTicks != null ? fmtInt(stopTicks) : "–"}</div>
                    <div className="aura-right">{riskUsd != null ? fmtNum(riskUsd, 2) : "–"}</div>
                    <div className="aura-right">{rr != null ? fmtNum(rr, 2) : "–"}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="aura-text-xs aura-muted aura-mt-10" style={{ maxWidth: 900 }}>
            Note: exitReason shows as <span className="aura-mono">UNKNOWN</span> because the worker is currently writing
            <span className="aura-mono"> exitReason: "UNKNOWN"</span> on close. We can infer TP vs SL from the bracket
            order tags (SL/TP) once we wire that mapping.
          </div>
        </div>
      </section>

      {/* 3) Setups table THIRD */}
      <section className="aura-card">
        <div className="aura-group-header">
          <div className="aura-group-title">Setups Reviewed (last 24h)</div>
          <Link className="aura-link aura-btn aura-btn-subtle" href="/app/reports">
            View full report →
          </Link>
        </div>

        <div className="aura-mt-12" style={{ overflowX: "auto" }}>
          <div className="aura-table aura-table-signals" style={{ minWidth: 1200 }}>
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
                <div className="aura-muted">No evaluated setups yet</div>
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
                const status = statusLabel(s.status);
                const reason = s.status === "TAKEN" ? "Taken" : reasonLabel(s.blockReason);

                const stop = toNum(s.stopTicks);
                const tp = toNum(s.tpTicks);
                const rr = toNum(s.rr);
                const contracts = toNum(s.contracts);
                const risk = toNum(s.riskUsdPlanned);

                const instrument =
                  (s.contractId && String(s.contractId).trim())
                    ? String(s.contractId)
                    : String(s.symbol);

                return (
                  <div key={s.signalKey} className="aura-table-row" style={{ whiteSpace: "nowrap" }}>
                    <div>{fmtTime(s.createdAt)}</div>
                    <div>{s.strategy}</div>
                    <div className="aura-mono">{instrument}</div>
                    <div>{s.side}</div>
                    <div>
                      <span className={pillClass()}>{status}</span>
                    </div>
                    <div className="aura-muted">{reason}</div>
                    <div className="aura-right">
                      {stop != null ? fmtInt(stop) : "–"} / {tp != null ? fmtInt(tp) : "–"}
                    </div>
                    <div className="aura-right">{rr != null ? fmtNum(rr, 2) : "–"}</div>
                    <div className="aura-right">{contracts != null ? fmtInt(contracts) : "–"}</div>
                    <div className="aura-right">{risk != null ? fmtNum(risk, 2) : "–"}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="aura-text-xs aura-muted aura-mt-10" style={{ maxWidth: 900 }}>
            This table is intentionally “later-stage only” so it reflects what Aura genuinely evaluated close to execution
            (TAKEN + key BLOCKED reasons).
          </div>
        </div>
      </section>
    </div>
  );
}
