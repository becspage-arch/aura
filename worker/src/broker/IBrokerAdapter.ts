import type { BrokerCapabilities } from "./BrokerCapabilities.js";

export type BrokerName = "cqg" | "rithmic" | "projectx" | "mock";

export interface BrokerContext {
  broker: BrokerName;
  env: "demo" | "live";
}

export type PlaceBracketOrderPlan = {
  contractId: string;
  symbol?: string | null;

  side: "buy" | "sell";
  size: number;
  entryType: "market" | "limit" | "stop";

  stopLossTicks?: number | null;
  takeProfitTicks?: number | null;

  stopPrice?: number | null;
  takeProfitPrice?: number | null;

  customTag?: string | null;
};

export type PlaceBracketOrderResult = {
  entryOrderId: string | null;
  stopOrderId: string | null;
  takeProfitOrderId: string | null;
  raw: any;
};

export interface IBrokerAdapter {
  readonly name: BrokerName;

  readonly capabilities: BrokerCapabilities;

  // lifecycle
  connect(): Promise<void>;
  authorize(): Promise<void>;
  disconnect(): Promise<void>;

  startKeepAlive(): void;
  stopKeepAlive(): void;

  // optional helpers
  warmup?(): Promise<void>;
  getStatus?(): Record<string, unknown>;
  getAuthToken?(): string | null;

  // Legacy execution methods (still used internally by adapters)
  placeOrderWithBrackets?: (input: any) => Promise<any>;
  placeOrder?: (input: any) => Promise<any>;
  placeBracketsAfterEntry?: (input: any) => Promise<any>;

  // NEW unified execution method (8E.7)
  placeBracketOrder(
    plan: PlaceBracketOrderPlan
  ): Promise<PlaceBracketOrderResult>;
}
