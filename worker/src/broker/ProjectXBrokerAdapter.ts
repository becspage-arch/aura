import type { IBrokerAdapter } from "./IBrokerAdapter.js";

export class ProjectXBrokerAdapter implements IBrokerAdapter {
  readonly name = "projectx" as const;

  async connect(): Promise<void> {
    const hasKey = Boolean(process.env.PROJECTX_API_KEY && process.env.PROJECTX_API_KEY !== "PASTE-HERE");
    console.log("[projectx-adapter] connect", { hasKey });
  }

  async authorize(): Promise<void> {
    console.log("[projectx-adapter] authorize", {
      apiKeyLoaded: Boolean(process.env.PROJECTX_API_KEY),
    });
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
