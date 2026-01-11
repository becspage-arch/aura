"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";
import type {
  DashboardAccount,
  DashboardOrder,
  DashboardFill,
  DashboardEventLog,
  DashboardTradingState,
} from "@/lib/dashboard/types";

type DashboardState = {
  accounts: DashboardAccount[];
  orders: DashboardOrder[];
  fills: DashboardFill[];
  events: DashboardEventLog[];
  tradingState: DashboardTradingState;
};

type Action =
  | { type: "INIT"; payload: DashboardState }
  | { type: "UPSERT_ORDER"; payload: DashboardOrder }
  | { type: "UPSERT_FILL"; payload: DashboardFill }
  | { type: "ADD_EVENT"; payload: DashboardEventLog }
  | { type: "SET_TRADING_STATE"; payload: Partial<DashboardTradingState> };

function upsertById<T extends { id: string }>(list: T[], item: T, max = 200) {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list].slice(0, max);
  const copy = list.slice();
  copy[idx] = item;
  return copy;
}

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "INIT":
      return action.payload;
    case "UPSERT_ORDER":
      return { ...state, orders: upsertById(state.orders, action.payload) };
    case "UPSERT_FILL":
      return { ...state, fills: upsertById(state.fills, action.payload) };
    case "ADD_EVENT":
      return { ...state, events: [action.payload, ...state.events].slice(0, 200) };
    case "SET_TRADING_STATE":
      return { ...state, tradingState: { ...state.tradingState, ...action.payload } };
    default:
      return state;
  }
}

const Ctx = createContext<{ state: DashboardState; dispatch: React.Dispatch<Action> } | null>(null);

export function DashboardProvider({ initial, children }: { initial: DashboardState; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
