// src/app/app/providers.tsx
"use client";

import { useEffect, useState } from "react";
import { DashboardProvider } from "@/components/dashboard/DashboardStore";

type BootstrapResponse = {
  ok: true;
  accounts: Array<{
    id: string;
    brokerName: string;
    accountLabel: string | null;
    externalId: string | null;
  }>;
  tradingState: {
    isPaused: boolean;
    isKillSwitched: boolean;
    killSwitchedAt: string | null;
    selectedBrokerAccountId: string | null;
    selectedSymbol: string | null;
  };
};

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const [initial, setInitial] = useState(() => ({
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
  }));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/dashboard/bootstrap", { method: "GET", cache: "no-store" });
        const json = (await res.json().catch(() => null)) as BootstrapResponse | any;
        if (cancelled) return;
        if (res.ok && json?.ok) {
          setInitial((prev) => ({
            ...prev,
            accounts: Array.isArray(json.accounts) ? json.accounts : [],
            tradingState: json.tradingState ?? prev.tradingState,
          }));
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <DashboardProvider initial={initial}>{children}</DashboardProvider>;
}
