// src/components/dashboard/sections/DashboardRecentTradesCard.tsx
"use client";

import Link from "next/link";
import { fmtMoneyUsd, fmtTimeLondon } from "@/components/dashboard/dashboardFormat";

function fmtPrice(v: any) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

export default function DashboardRecentTradesCard({ trades }: { trades: any[] | null | undefined }) {
  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Recent Trades</div>
          <div className="aura-muted aura-text-xs">Last 10</div>
        </div>

        <Link href="/app/reports" className="aura-link aura-text-xs">
          View All →
        </Link>
      </div>

      <div className="aura-mt-12 aura-table" role="table" aria-label="Recent trades table">
        <div className="aura-table-header" role="row">
          <div role="columnheader">Trade ID</div>
          <div role="columnheader">Pair</div>
          <div role="columnheader">Type</div>
          <div role="columnheader" className="aura-hide-sm">
            Entry
          </div>
          <div role="columnheader" className="aura-hide-sm">
            Exit
          </div>
          <div role="columnheader" className="aura-right">
            P&amp;L
          </div>
          <div role="columnheader" className="aura-hide-sm aura-right">
            R:R
          </div>
          <div role="columnheader" className="aura-right">
            Time
          </div>
          <div role="columnheader" className="aura-hide-sm">
            Status
          </div>
        </div>

        {trades?.length ? (
          trades.map((t: any) => (
            <div className="aura-table-row" role="row" key={t.tradeId ?? t.execKey ?? t.timeIso}>
              <div>{String(t.tradeId ?? "—").slice(0, 8)}</div>
              <div>{t.pair ?? "—"}</div>
              <div>{t.type ?? "—"}</div>
              <div className="aura-hide-sm">{fmtPrice(t.entryPrice)}</div>
              <div className="aura-hide-sm">{fmtPrice(t.exitPrice)}</div>
              <div className="aura-right">{fmtMoneyUsd(t.pnlUsd)}</div>
              <div className="aura-hide-sm aura-right">{t.rr != null ? `${Number(t.rr).toFixed(2)}R` : "—"}</div>
              <div className="aura-right">{t.timeIso ? fmtTimeLondon(t.timeIso) : "—"}</div>
              <div className="aura-hide-sm">{t.status ?? "—"}</div>
            </div>
          ))
        ) : (
          <div className="aura-table-row" role="row">
            <div className="aura-muted">—</div>
            <div className="aura-muted">—</div>
            <div className="aura-muted">—</div>
            <div className="aura-muted aura-hide-sm">—</div>
            <div className="aura-muted aura-hide-sm">—</div>
            <div className="aura-muted aura-right">—</div>
            <div className="aura-muted aura-hide-sm aura-right">—</div>
            <div className="aura-muted aura-right">—</div>
            <div className="aura-muted aura-hide-sm">—</div>
          </div>
        )}
      </div>

      <p className="aura-muted aura-text-xs aura-mt-10">
        The full trade log lives in{" "}
        <Link href="/app/reports" className="aura-link">
          Reports
        </Link>
        .
      </p>
    </section>
  );
}
