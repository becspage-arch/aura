// src/components/dashboard/sections/DashboardRecentTradesCard.tsx
"use client";

import Link from "next/link";
import { fmtMoneyUsd, fmtTimeLondon } from "@/components/dashboard/dashboardFormat";

export default function DashboardRecentTradesCard({ trades }: { trades: any[] | null | undefined }) {
  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div className="aura-card-title">Recent Trades</div>
        <div className="aura-muted aura-text-xs">Last 10</div>
      </div>

      <div className="aura-mt-12 aura-table" role="table" aria-label="Recent trades table">
        <div className="aura-table-header" role="row">
          <div role="columnheader">Time</div>
          <div role="columnheader">Symbol</div>
          <div role="columnheader">Side</div>
          <div role="columnheader" className="aura-hide-sm">
            Exit
          </div>
          <div role="columnheader" className="aura-right">
            Result
          </div>
        </div>

        {trades?.length ? (
          trades.map((t: any) => (
            <div className="aura-table-row" role="row" key={t.execKey ?? `${t.closedAt}-${t.symbol}-${t.side}`}>
              <div>{fmtTimeLondon(t.closedAt)}</div>
              <div>{t.symbol}</div>
              <div>{t.side}</div>
              <div className="aura-hide-sm">{t.exitReason}</div>
              <div className="aura-right">{fmtMoneyUsd(t.realizedPnlUsd)}</div>
            </div>
          ))
        ) : (
          <div className="aura-table-row" role="row">
            <div className="aura-muted">—</div>
            <div className="aura-muted">—</div>
            <div className="aura-muted">—</div>
            <div className="aura-muted aura-hide-sm">—</div>
            <div className="aura-muted aura-right">—</div>
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
