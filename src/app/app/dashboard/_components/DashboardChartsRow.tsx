// src/app/app/dashboard/_components/DashboardChartsRow.tsx
"use client";

import type { RangeKey } from "@/lib/dashboard/types";

import DashboardCumulativePnlCard from "@/components/dashboard/sections/DashboardCumulativePnlCard";
import DashboardMonthlyPnlCard from "@/components/dashboard/sections/DashboardMonthlyPnlCard";

type CumPoint = { day: string; pnlUsd: string; cumulativeUsd: string };
type MonthlyDay = { day: string; pnlUsd: string };

export default function DashboardChartsRow(props: {
  cumulative: { range: RangeKey; points: CumPoint[] } | null;
  monthCalendar: { month: string; days: MonthlyDay[] } | null;
  cumRange: RangeKey;
  onCumRangeChange: (r: RangeKey) => void;
}) {
  return (
    <div className="aura-card-stack">
      <DashboardCumulativePnlCard
        points={props.cumulative?.points ?? []}
        cumRange={props.cumRange}
        setCumRange={props.onCumRangeChange}
      />

      <DashboardMonthlyPnlCard monthCalendar={props.monthCalendar} />
    </div>
  );
}
