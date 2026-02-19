// src/app/dashboard/layout.tsx
"use client";

import { DashboardProvider } from "@/components/dashboard/DashboardStore";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const initial = {
    accounts: [],
    orders: [],
    fills: [],
    events: [],
    tradingState: {
      isPaused: false,
      isKillSwitched: false,
      killSwitchedAt: null,
      selectedBrokerAccountId: null,
      selectedSymbol: null,
    },
    summary: null,
  };

  return <DashboardProvider initial={initial}>{children}</DashboardProvider>;
}
