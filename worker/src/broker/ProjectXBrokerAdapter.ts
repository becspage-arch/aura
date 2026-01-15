import type { IBrokerAdapter } from "./IBrokerAdapter.js";

export class ProjectXBrokerAdapter implements IBrokerAdapter {
  readonly name = "projectx" as const;

  async connect(): Promise<void> {
    const hasKey = Boolean(process.env.PROJECTX_API_KEY && process.env.PROJECTX_API_KEY !== "PASTE-HERE");
    console.log("[projectx-adapter] connect", { hasKey });
  }

  async authorize(): Promise<void> {
    const userName = process.env.PROJECTX_USERNAME;
    const apiKey = process.env.PROJECTX_API_KEY;

    if (!userName) throw new Error("PROJECTX_USERNAME missing");
    if (!apiKey) throw new Error("PROJECTX_API_KEY missing");

    const res = await fetch("https://api.topstepx.com/api/Auth/loginKey", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userName, apiKey }),
    });

    const text = await res.text();

    console.log("[projectx-adapter] authorize loginKey", {
      status: res.status,
      ok: res.ok,
      body: text.slice(0, 300),
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
