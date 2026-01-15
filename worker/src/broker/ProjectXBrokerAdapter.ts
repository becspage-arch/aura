import type { IBrokerAdapter } from "./IBrokerAdapter.js";

export class ProjectXBrokerAdapter implements IBrokerAdapter {
  readonly name = "projectx" as const;

  async connect(): Promise<void> {
    const hasKey = Boolean(process.env.PROJECTX_API_KEY && process.env.PROJECTX_API_KEY !== "PASTE-HERE");
    console.log("[projectx-adapter] connect", { hasKey });
  }

  async authorize(): Promise<void> {
    const apiKey = process.env.PROJECTX_API_KEY;

    if (!apiKey) {
      throw new Error("PROJECTX_API_KEY missing");
    }

    const res = await fetch("https://api.topstepx.com/v1/account", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    console.log("[projectx-adapter] authorize response", {
      status: res.status,
      ok: res.ok,
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
