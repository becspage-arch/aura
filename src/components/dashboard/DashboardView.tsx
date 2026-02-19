// src/components/dashboard/DashboardView.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useDashboard } from "@/components/dashboard/DashboardStore";

const LONDON_TZ = "Europe/London";

/* -----------------------------------------
   Formatting helpers
------------------------------------------ */

function fmtMoneyUsd(v: any) {
  if (v == null) return "$—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "$—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtMoneyUsdSignedShort(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  const sign = n < 0 ? "-" : "+";
  const abs = Math.abs(n);
  return `${sign}$${Math.round(abs)}`;
}

function fmtTimeLondon(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: LONDON_TZ,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function parseDayToUTCDate(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

function weekdayIndexMondayFirst(d: Date) {
  const js = d.getUTCDay(); // 0=Sun
  return (js + 6) % 7; // convert to Mon=0
}

/* =========================================
   DASHBOARD VIEW
========================================= */

export default function DashboardView({
  clerkUserId,
}: {
  clerkUserId?: string;
}) {
  const { state, dispatch } = useDashboard();

  /* -----------------------------------------
     Load summary
  ------------------------------------------ */

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard/summary");
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          dispatch({ type: "SET_SUMMARY", payload: json });
        }
      } catch {
        // ignore
      }
    }
    load();
  }, [dispatch]);

  const channelName = useMemo(
    () => (clerkUserId ? `user:${clerkUserId}` : null),
    [clerkUserId]
  );

  /* -----------------------------------------
     KPI values
  ------------------------------------------ */

  const totalProfit = state.summary
    ? fmtMoneyUsd(state.summary.kpis.totalProfitUsd)
    : "$—";

  const todayPnl = state.summary
    ? fmtMoneyUsd(state.summary.kpis.todayPnlUsd)
    : "$—";

  const monthPnl = state.summary
    ? fmtMoneyUsd(state.summary.kpis.monthPnlUsd)
    : "$—";

  const accountEquity =
    state.summary?.kpis?.accountEquityUsd != null
      ? fmtMoneyUsd(state.summary.kpis.accountEquityUsd)
      : "$—";

  const strategyStatus =
    state.summary?.status?.strategy === "PAUSED"
      ? "Paused"
      : "Active";

  const tradingStatus =
    state.summary?.status?.trading === "STOPPED"
      ? "Stopped"
      : "Live";

  const brokerStatus = state.summary?.status?.broker ?? "Unknown";
  const symbol = state.summary?.status?.symbol ?? "MGC";
  const riskMode = state.summary?.status?.riskMode ?? "Normal";

  const lastTrade = state.summary?.status?.lastTradeAt
    ? fmtTimeLondon(state.summary.status.lastTradeAt)
    : "—";

  const perf = state.summary?.performance30d ?? null;

  /* -----------------------------------------
     MONTH MODEL (heatmap)
  ------------------------------------------ */

  const monthModel = useMemo(() => {
    const cal = state.summary?.charts?.monthCalendar;
    if (!cal?.month || !Array.isArray(cal.days)) return null;

    const [yearStr, monthStr] = cal.month.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);

    const daysMap = new Map<string, number>();
    for (const d of cal.days) {
      const pnl = Number(d.pnlUsd);
      if (Number.isFinite(pnl)) {
        daysMap.set(d.day, pnl);
      }
    }

    const first = new Date(Date.UTC(year, month - 1, 1));
    const next = new Date(Date.UTC(year, month, 1));
    const daysInMonth =
      (next.getTime() - first.getTime()) / (24 * 3600 * 1000);

    const allDays: any[] = [];

    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, 1 + i));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      const pnl = daysMap.get(key) ?? 0;

      allDays.push({
        day: key,
        dom: Number(dd),
        pnl,
        pnlLabel: fmtMoneyUsdSignedShort(pnl),
        sign: pnl > 0 ? "pos" : pnl < 0 ? "neg" : "zero",
      });
    }

    const blanks = Array.from(
      { length: weekdayIndexMondayFirst(first) },
      () => ({ kind: "blank" })
    );

    return {
      monthLabel: new Intl.DateTimeFormat("en-GB", {
        timeZone: LONDON_TZ,
        month: "long",
        year: "numeric",
      }).format(parseDayToUTCDate(`${cal.month}-01`)),
      cells: [
        ...blanks,
        ...allDays.map((d) => ({ kind: "day", ...d })),
      ],
    };
  }, [state.summary?.charts?.monthCalendar]);

  /* =========================================
     RENDER
  ========================================= */

  return (
    <div className="aura-page">
      <p className="aura-page-subtitle">
        Profit-first overview. Calm, clear, in control.
      </p>

      {/* KPIs */}
      <section className="aura-grid-4">
        <div className="aura-card">
          <div className="aura-stat-label">Total Profit</div>
          <div className="aura-stat-value">{totalProfit}</div>
          <div className="aura-stat-sub">All time</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Today</div>
          <div className="aura-stat-value">{todayPnl}</div>
          <div className="aura-stat-sub">Since 00:00</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">This Month</div>
          <div className="aura-stat-value">{monthPnl}</div>
          <div className="aura-stat-sub">Calendar month</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Account Equity</div>
          <div className="aura-stat-value">{accountEquity}</div>
          <div className="aura-stat-sub">Live account value</div>
        </div>
      </section>

      {/* Monthly Heatmap */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Monthly P&L</div>
          <div className="aura-muted aura-text-xs">
            {monthModel?.monthLabel ?? "—"}
          </div>
        </div>

        {monthModel ? (
          <div className="aura-heat-grid">
            {monthModel.cells.map((c: any, idx: number) => {
              if (c.kind === "blank") {
                return (
                  <div
                    key={`b:${idx}`}
                    className="aura-heat-cell aura-heat-cell--blank"
                  />
                );
              }

              return (
                <div
                  key={c.day}
                  className={`aura-heat-cell aura-heat-cell--${c.sign}`}
                  title={`${c.day} ${fmtMoneyUsd(c.pnl)}`}
                >
                  <span className="aura-heat-dom">
                    {c.dom}
                  </span>
                  {c.pnlLabel && (
                    <span className="aura-heat-pnl">
                      {c.pnlLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="aura-muted aura-text-xs">
            No month data yet.
          </div>
        )}
      </section>
    </div>
  );
}
