// src/app/app/dashboard/_components/DashboardChartsRow.tsx
"use client";

import type { RangeKey } from "@/lib/dashboard/types";

import DashboardCumulativePnlCard from "@/components/dashboard/sections/DashboardCumulativePnlCard";
import DashboardMonthlyPnlCard from "@/components/dashboard/sections/DashboardMonthlyPnlCard";

export default function DashboardChartsRow(props: {
  cumulative: { range: RangeKey; points: Array<{ day: string; pnlUsd: string; cumulativeUsd: string }> } | null;
  monthCalendar: { month: string; days: Array<{ day: string; pnlUsd: string }> } | null;
  cumRange: RangeKey;
  onCumRangeChange: (r: RangeKey) => void;
}) {
  return (
    <div className="aura-card-stack">
      <DashboardCumulativePnlCard
        cumRange={props.cumRange}
        setCumRange={props.onCumRangeChange}
        points={props.cumulative?.points ?? []}
      />

      <DashboardMonthlyPnlCard monthCalendar={props.monthCalendar} />
    </div>
  );
}
