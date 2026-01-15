import type { IBrokerAdapter } from "./IBrokerAdapter.js";

export class RithmicBrokerAdapter implements IBrokerAdapter {
  readonly name = "rithmic" as const;

  async connect(): Promise<void> {
    console.log("[rithmic-adapter] connect (stub)");
  }

  async authorize(): Promise<void> {
    console.log("[rithmic-adapter] authorize (stub)");
  }

  startKeepAlive(): void {
    // no-op for now
  }

  stopKeepAlive(): void {
    // no-op for now
  }

  async disconnect(): Promise<void> {
    // no-op for now
  }
}
