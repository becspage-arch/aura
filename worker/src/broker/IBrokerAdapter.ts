export type BrokerName = "cqg" | "rithmic" | "projectx" | "mock";

export interface BrokerContext {
  broker: BrokerName;
  env: "demo" | "live";
}

export type BrokerStatus = {
  tokenOk?: boolean;
  accountId?: number | null;
  accountName?: string | null;
  simulated?: boolean | null;
};

export interface IBrokerAdapter {
  readonly name: BrokerName;

  // lifecycle
  connect(): Promise<void>;
  authorize(): Promise<void>;
  disconnect(): Promise<void>;

  // keepalive hooks (no-op if not needed)
  startKeepAlive(): void;
  stopKeepAlive(): void;

  // optional status surface (safe for adapters that don't support it yet)
  getStatus?: () => BrokerStatus;
}
