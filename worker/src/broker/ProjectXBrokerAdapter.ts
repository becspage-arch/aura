import type { IBrokerAdapter } from "./IBrokerAdapter.js";

export class ProjectXBrokerAdapter implements IBrokerAdapter {
  readonly name = "projectx" as const;

  async connect(): Promise<void> {
    // TODO: implement ProjectX auth (TopstepX API key flow)
    console.log("[projectx-adapter] connect (stub)");
  }

  async authorize(): Promise<void> {
    console.log("[projectx-adapter] authorize (stub)");
  }

  startKeepAlive(): void {
    // TODO: implement if required by ProjectX gateway
  }

  stopKeepAlive(): void {
    // TODO
  }

  async disconnect(): Promise<void> {
    // TODO
  }
}
