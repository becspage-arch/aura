// src/components/dashboard/DashboardView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardStore";

const LONDON_TZ = "Europe/London";

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
  const whole = Math.round(abs);
  return `${sign}$${whole}`;
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
  const js = d.getUTCDay();
  return (js + 6) % 7;
}

export default function DashboardView({ clerkUserId }: { clerkUserId?: string }) {
  const { state, dispatch } = useDashboard();

  const [cumRange, setCumRange] = useState<"1M" | "3M" | "6M" | "1Y" | "ALL">("1Y");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/summary?range=${cumRange}`, { method: "GET" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          dispatch({ type: "SET_SUMMARY", payload: json });
        }
      } catch {
        // ignore
      }
    }
    load();
  }, [dispatch, cumRange]);

  const channelName = useMemo(() => (clerkUserId ? `user:${clerkUserId}` : null), [clerkUserId]);

  const totalProfit = state.summary ? fmtMoneyUsd(state.summary.kpis.totalProfitUsd) : "$—";
  const todayPnl = state.summary ? fmtMoneyUsd(state.summary.kpis.todayPnlUsd) : "$—";
  const monthPnl = state.summary ? fmtMoneyUsd(state.summary.kpis.monthPnlUsd) : "$—";

  const accountEquity =
    state.summary?.kpis?.accountEquityUsd != null ? fmtMoneyUsd(state.summary.kpis.accountEquityUsd) : "$—";

  const strategyStatus = state.summary
    ? state.summary.status.strategy === "PAUSED"
      ? "Paused"
      : "Active"
    : state.tradingState?.isPaused
      ? "Paused"
      : "Active";

  const tradingStatus = state.summary
    ? state.summary.status.trading === "STOPPED"
      ? "Stopped"
      : "Live"
    : state.tradingState?.isKillSwitched
      ? "Stopped"
      : "Live";

  const brokerStatus = state.summary?.status?.broker ?? "Unknown";
  const symbol = state.summary?.status?.symbol ?? state.tradingState?.selectedSymbol ?? "MGC";
  const riskMode = state.summary?.status?.riskMode ?? "Normal";

  const lastTrade = state.summary?.status?.lastTradeAt ? fmtTimeLondon(state.summary.status.lastTradeAt) : "—";

  const perf = state.summary?.performance30d ?? null;

  // ---------- Cumulative line chart model ----------
  const cumChart = useMemo(() => {
    const pts = state.summary?.charts?.cumulativePnl?.points;
    if (!Array.isArray(pts) || pts.length < 2) return null;

    const ys = pts.map((p: any) => Number(p.cumulativeUsd));
    const xs = pts.map((p: any) => String(p.day));

    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const span = yMax - yMin || 1;

    // SVG coordinate system
    const W = 1000;
    const H = 260;
    const padL = 22;
    const padR = 18;
    const padT = 16;
    const padB = 26;

    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const toX = (i: number) => padL + (i / (pts.length - 1)) * innerW;
    const toY = (v: number) => padT + (1 - (v - yMin) / span) * innerH;

    const lineD = pts
      .map((p: any, i: number) => {
        const x = toX(i);
        const y = toY(Number(p.cumulativeUsd));
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    const areaD = `${lineD} L ${(padL + innerW).toFixed(2)} ${(padT + innerH).toFixed(
      2
    )} L ${padL.toFixed(2)} ${(padT + innerH).toFixed(2)} Z`;

    const startLabel = xs[0];
    const endLabel = xs[xs.length - 1];

    return { W, H, lineD, areaD, startLabel, endLabel };
  }, [state.summary?.charts?.cumulativePnl?.points]);

  // ---------- Month heatmap model ----------
  const monthModel = useMemo(() => {
    const cal = state.summary?.charts?.monthCalendar;
    if (!cal?.month || !Array.isArray(cal.days)) return null;

    const monthStr: string = cal.month; // "YYYY-MM"
    const [yStr, mStr] = monthStr.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

    const daysMap = new Map<string, number>();
    for (const d of cal.days) {
      const day = String(d.day);
      const pnl = Number(d.pnlUsd);
      if (day && Number.isFinite(pnl)) daysMap.set(day, pnl);
    }

    const first = new Date(Date.UTC(year, month - 1, 1));
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const daysInMonth = Math.round((nextMonth.getTime() - first.getTime()) / (24 * 3600 * 1000));

    const allDays: { day: string; pnl: number }[] = [];
    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, 1 + i));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      allDays.push({ day: key, pnl: daysMap.get(key) ?? 0 });
    }

    const maxAbs = allDays.reduce((acc, x) => Math.max(acc, Math.abs(x.pnl)), 0);

    function level(pnl: number) {
      if (maxAbs <= 0) return 0;
      const r = Math.abs(pnl) / maxAbs;
      if (r === 0) return 0;
      if (r <= 0.25) return 1;
      if (r <= 0.5) return 2;
      if (r <= 0.75) return 3;
      return 4;
    }

    const firstDow = weekdayIndexMondayFirst(first);
    const blanks = Array.from({ length: firstDow }, () => ({ kind: "blank" as const }));

    const cells = [
      ...blanks,
      ...allDays.map((x) => ({
        kind: "day" as const,
        day: x.day,
        dom: Number(x.day.slice(8, 10)),
        pnl: x.pnl,
        pnlLabel: fmtMoneyUsdSignedShort(x.pnl),
        sign: x.pnl > 0 ? "pos" : x.pnl < 0 ? "neg" : "zero",
        level: level(x.pnl),
      })),
    ];

    return {
      monthLabel: new Intl.DateTimeFormat("en-GB", { timeZone: LONDON_TZ, month: "long", year: "numeric" }).format(
        parseDayToUTCDate(`${monthStr}-01`)
      ),
      cells,
    };
  }, [state.summary?.charts?.monthCalendar]);

  return (
    <div className="aura-page">
      <div className="aura-row-between">
        <div>
          <p className="aura-page-subtitle">Profit-first overview. Calm, clear, in control.</p>
        </div>
      </div>

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

      <section className="aura-card aura-health">
        <div className="aura-health-top">
          <div className="aura-card-title">System Status</div>
          <div className="aura-muted aura-text-xs">Channel: {channelName ?? "—"}</div>
        </div>

        <div className="aura-health-strip" aria-label="System status">
          <div className="aura-health-pill">
            <span className="aura-health-key">Strategy</span>
            <span className="aura-health-val">{strategyStatus}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Trading</span>
            <span className="aura-health-val">{tradingStatus}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Broker</span>
            <span className="aura-health-val">{brokerStatus}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Symbol</span>
            <span className="aura-health-val">{symbol}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Risk</span>
            <span className="aura-health-val">{riskMode}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Last trade</span>
            <span className="aura-health-val">{lastTrade}</span>
          </div>
        </div>
      </section>

      {/* Section 3: Cumulative P&L (Line) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Cumulative P&L</div>
            <div className="aura-muted aura-text-xs">Performance overview</div>
          </div>

          <div className="aura-range-tabs" role="tablist" aria-label="Cumulative P&L range">
            {(["1M", "3M", "6M", "1Y", "ALL"] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`aura-range-tab ${cumRange === r ? "aura-range-tab--active" : ""}`}
                onClick={() => setCumRange(r)}
                role="tab"
                aria-selected={cumRange === r}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {cumChart ? (
          <div className="aura-linechart">
            <svg
              className="aura-linechart__svg"
              viewBox={`0 0 ${cumChart.W} ${cumChart.H}`}
              role="img"
              aria-label="Cumulative P&L line chart"
            >
              <path className="aura-linechart__area" d={cumChart.areaD} />
              <path className="aura-linechart__line" d={cumChart.lineD} />
            </svg>

            <div className="aura-linechart__x">
              <span className="aura-muted aura-text-xs">{cumChart.startLabel}</span>
              <span className="aura-muted aura-text-xs">{cumChart.endLabel}</span>
            </div>
          </div>
        ) : (
          <div className="aura-muted aura-text-xs aura-mt-10">No chart data yet.</div>
        )}
      </section>

      {/* Section 3b: Monthly calendar heatmap */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Monthly P&L</div>
          <div className="aura-muted aura-text-xs">{monthModel?.monthLabel ?? "—"}</div>
        </div>

        {monthModel ? (
          <div className="aura-heat">
            <div className="aura-heat-weekdays" aria-hidden="true">
              <div className="aura-heat-weekday">Mon</div>
              <div className="aura-heat-weekday">Tue</div>
              <div className="aura-heat-weekday">Wed</div>
              <div className="aura-heat-weekday">Thu</div>
              <div className="aura-heat-weekday">Fri</div>
              <div className="aura-heat-weekday">Sat</div>
              <div className="aura-heat-weekday">Sun</div>
            </div>

            <div className="aura-heat-grid" role="grid" aria-label="Monthly P&L heatmap">
              {monthModel.cells.map((c: any, idx: number) => {
                if (c.kind === "blank") {
                  return <div key={`b:${idx}`} className="aura-heat-cell aura-heat-cell--blank" />;
                }

                const cls =
                  c.sign === "pos"
                    ? `aura-heat-cell aura-heat-cell--pos aura-heat-cell--l${c.level}`
                    : c.sign === "neg"
                      ? `aura-heat-cell aura-heat-cell--neg aura-heat-cell--l${c.level}`
                      : "aura-heat-cell aura-heat-cell--zero";

                return (
                  <div key={c.day} className={cls} role="gridcell" title={`${c.day}  ${fmtMoneyUsd(c.pnl)}`}>
                    <span className="aura-heat-dom">{c.dom}</span>
                    {c.pnlLabel ? <span className="aura-heat-pnl">{c.pnlLabel}</span> : null}
                  </div>
                );
              })}
            </div>

            <div className="aura-heat-legend">
              <span className="aura-muted aura-text-xs">Less</span>
              <span className="aura-heat-swatch aura-heat-swatch--neg aura-heat-swatch--l2" />
              <span className="aura-heat-swatch aura-heat-swatch--zero" />
              <span className="aura-heat-swatch aura-heat-swatch--pos aura-heat-swatch--l2" />
              <span className="aura-muted aura-text-xs">More</span>
            </div>
          </div>
        ) : (
          <div className="aura-muted aura-text-xs aura-mt-10">No month data yet.</div>
        )}
      </section>

      <section className="aura-grid-4">
        <div className="aura-card">
          <div className="aura-stat-label">Win Rate</div>
          <div className="aura-mini-value">{perf ? `${Math.round(perf.winRatePct)}%` : "—%"}</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Profit Factor</div>
          <div className="aura-mini-value">{perf ? perf.profitFactor.toFixed(2) : "—"}</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Avg R:R</div>
          <div className="aura-mini-value">{perf ? `${perf.avgRR.toFixed(2)}R` : "—R"}</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>

        <div className="aura-card">
          <div className="aura-stat-label">Max Drawdown</div>
          <div className="aura-mini-value">{perf?.maxDrawdownUsd != null ? fmtMoneyUsd(perf.maxDrawdownUsd) : "—"}</div>
          <div className="aura-stat-sub">Last 30 days</div>
        </div>
      </section>

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

          {state.summary?.recentTrades?.length ? (
            state.summary.recentTrades.map((t: any) => (
              <div className="aura-table-row" role="row" key={t.execKey}>
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

        <p className="aura-muted aura-text-xs aura-mt-10">The full trade log lives in Trades & Logs.</p>
      </section>
    </div>
  );
}
