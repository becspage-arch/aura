// src/components/dashboard/DashboardStore.tsx
"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";

const MAX_EVENTS = 200;
const MAX_ORDERS = 500;
const MAX_FILLS = 500;

/* -------------------------
   Types used by the dashboard
-------------------------- */

export type DashboardOrder = {
  id: string;
  brokerAccountId: string;
  externalId?: string | null;
  symbol: string;
  side: any;
  type: any;
  status: any;
  qty: string;
  price?: string | null;
  stopPrice?: string | null;
  filledQty: string;
  avgFillPrice?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardFill = {
  id: string;
  brokerAccountId: string;
  orderId?: string | null;
  externalId?: string | null;
  symbol: string;
  side: any;
  qty: string;
  price: string;
  createdAt: string;
};

export type DashboardEvent = {
  id: string;
  createdAt: string;
  type: string;
  level: string;
  message: string;
  data?: any;
  brokerAccountId?: string | null;
  orderId?: string | null;
};

export type DashboardAccount = { id: string; [key: string]: any };

export type DashboardState = {
  accounts: DashboardAccount[];
  orders: DashboardOrder[];
  fills: DashboardFill[];
  events: DashboardEvent[];
  tradingState: {
    isPaused: boolean;
    isKillSwitched: boolean;
    killSwitchedAt?: string | null;
    selectedBrokerAccountId?: string | null;
    selectedSymbol?: string | null;
  };
  summary: any | null;
};

type Action =
  | { type: "INIT"; payload: DashboardState }
  | { type: "ADD_EVENT"; payload: DashboardEvent }
  | { type: "UPSERT_ORDER"; payload: DashboardOrder }
  | { type: "UPSERT_FILL"; payload: DashboardFill }
  | {
      type: "SET_TRADING_STATE";
      payload: Partial<DashboardState["tradingState"]>;
    }
  | { type: "SET_SUMMARY"; payload: any };

/* -------------------------
   Helpers
-------------------------- */

function upsertById<T extends { id: string }>(list: T[], item: T, max: number) {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list].slice(0, max);

  const copy = list.slice();
  copy[idx] = { ...copy[idx], ...item };
  return copy;
}

/* -------------------------
   Reducer
-------------------------- */

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "INIT":
      return action.payload;

    case "ADD_EVENT":
      return {
        ...state,
        events: [action.payload, ...state.events].slice(0, MAX_EVENTS),
      };

    case "UPSERT_ORDER":
      return {
        ...state,
        orders: upsertById(state.orders, action.payload, MAX_ORDERS),
      };

    case "UPSERT_FILL":
      return {
        ...state,
        fills: upsertById(state.fills, action.payload, MAX_FILLS),
      };

    case "SET_TRADING_STATE":
      return {
        ...state,
        tradingState: { ...state.tradingState, ...action.payload },
      };

    case "SET_SUMMARY":
      return {
        ...state,
        summary: action.payload,
      };

    default:
      return state;
  }
}

/* -------------------------
   Context
-------------------------- */

const DashboardContext = createContext<{
  state: DashboardState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

/* -------------------------
   Provider
-------------------------- */

export function DashboardProvider({
  initial,
  children,
}: {
  initial: DashboardState;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initial);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

/* -------------------------
   Hook
-------------------------- */

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return ctx;
}
