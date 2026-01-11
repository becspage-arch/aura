"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";

/* -------------------------
   Types used by the dashboard
-------------------------- */

export type DashboardState = {
  orders: any[];
  fills: any[];
  events: any[];
  tradingState: {
    isPaused: boolean;
    isKillSwitched: boolean;
    killSwitchedAt?: string | null;
    selectedBrokerAccountId?: string | null;
    selectedSymbol?: string | null;
  };
};

type Action =
  | { type: "INIT"; payload: DashboardState }
  | { type: "ADD_EVENT"; payload: any }
  | {
      type: "SET_TRADING_STATE";
      payload: Partial<DashboardState["tradingState"]>;
    };

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
        events: [action.payload, ...state.events].slice(0, 200),
      };

    case "SET_TRADING_STATE":
      return {
        ...state,
        tradingState: { ...state.tradingState, ...action.payload },
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

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
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
