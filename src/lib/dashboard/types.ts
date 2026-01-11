export type DashboardAccount = {
  id: string;
  brokerName: string;
  accountLabel?: string | null;
  externalId?: string | null;
};

export type DashboardOrder = {
  id: string;
  brokerAccountId: string;
  externalId?: string | null;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  status: "NEW" | "PLACED" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED";
  qty: string; // Decimal -> string for UI
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
  side: "BUY" | "SELL";
  qty: string;   // Decimal -> string
  price: string; // Decimal -> string
  createdAt: string;
};

export type DashboardEventLog = {
  id: string;
  createdAt: string;
  type: string;
  level: string;
  message: string;
  data?: any;
  brokerAccountId?: string | null;
  orderId?: string | null;
};

export type DashboardAuditLog = {
  id: string;
  createdAt: string;
  action: string;
  data?: any;
};

export type DashboardTradingState = {
  isPaused: boolean;
  isKillSwitched: boolean;
  killSwitchedAt?: string | null;
  selectedBrokerAccountId?: string | null;
  selectedSymbol?: string | null;
};
