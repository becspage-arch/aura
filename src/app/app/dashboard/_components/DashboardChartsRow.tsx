// src/app/app/dashboard/_components/DashboardChartsRow.tsx

import DashboardCumulativePnlCard from "@/components/dashboard/sections/DashboardCumulativePnlCard";
import DashboardMonthlyPnlCard from "@/components/dashboard/sections/DashboardMonthlyPnlCard";

export default function DashboardChartsRow(props: {
  cumulative: any;
  monthCalendar: any;
}) {
  return (
    <>
      <DashboardCumulativePnlCard data={props.cumulative} />
      <DashboardMonthlyPnlCard data={props.monthCalendar} />
    </>
  );
}
