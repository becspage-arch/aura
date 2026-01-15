import type { IBrokerAdapter } from "./IBrokerAdapter.js";

export class CqgBrokerAdapter implements IBrokerAdapter {
  readonly name = "cqg" as const;

  async connect(): Promise<void> {
    console.log("[cqg-adapter] connect");

    const { startCqgDemoFeed } = await import("../cqg/client.js");

    // startCqgDemoFeed already:
    // - opens the WS
    // - loads protos
    // - sends logon
    // - gates on failure
    // - manages keepalive internally (for now)
    await startCqgDemoFeed();
  }

  async authorize(): Promise<void> {
    // No-op for now because startCqgDemoFeed() already performs logon inside connect().
    console.log("[cqg-adapter] authorize (noop - handled in connect)");
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
