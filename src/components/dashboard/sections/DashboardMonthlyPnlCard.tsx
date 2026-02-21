// src/components/dashboard/sections/DashboardMonthlyPnlCard.tsx
"use client";

import { useMemo } from "react";
import {
  fmtMoneyUsd,
  fmtMoneyUsdSignedShort,
  parseDayToUTCDate,
  weekdayIndexMondayFirst,
  getLondonTz,
} from "@/components/dashboard/dashboardFormat";

export default function DashboardMonthlyPnlCard({
  monthCalendar,
}: {
  monthCalendar: any | null | undefined;
}) {
  const monthModel = useMemo(() => {
    const cal = monthCalendar;
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

    const tz = getLondonTz();

    return {
      monthLabel: new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "long", year: "numeric" }).format(
        parseDayToUTCDate(`${monthStr}-01`)
      ),
      cells,
    };
  }, [monthCalendar]);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div className="aura-card-title">Monthly P&amp;L</div>
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
  );
}
