export type BrokerName = "cqg" | "rithmic" | "mock";

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
}
