export type BrokerName = "cqg" | "rithmic" | "projectx" | "mock";

export interface BrokerContext {
  broker: BrokerName;
  env: "demo" | "live";
}

export interface IBrokerAdapter {
  readonly name: BrokerName;

  // lifecycle
  connect(): Promise<void>;
  authorize(): Promise<void>;
  disconnect(): Promise<void>;

  // keepalive hooks (no-op if not needed)
  startKeepAlive(): void;
  stopKeepAlive(): void;

  // optional helpers (safe for adapters that don't implement them)
  warmup?(): Promise<void>;
  getStatus?(): Record<string, unknown>;
  getAuthToken?(): string | null;
}

import type { BrokerCapabilities } from "./BrokerCapabilities.js";

export interface IBrokerAdapter {
  readonly name: string;

  readonly capabilities: BrokerCapabilities;

  // existing lifecycle
  connect(): Promise<void>;
  authorize(): Promise<void>;
  startKeepAlive(): void;
  stopKeepAlive(): void;
  disconnect(): Promise<void>;

  // Execution methods (already exist on ProjectX adapter)
  // Flow A:
  placeOrderWithBrackets?: (input: any) => Promise<any>;

  // Flow B:
  placeOrder?: (input: any) => Promise<any>;
  placeBracketsAfterEntry?: (input: any) => Promise<any>;
}
