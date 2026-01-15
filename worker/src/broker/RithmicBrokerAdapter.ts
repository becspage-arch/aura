import type { IBrokerAdapter } from "./IBrokerAdapter.js";
import { getRithmicConfig } from "./rithmicConfig.js";
import { createRithmicWs } from "./rithmicWs.js";
import type WebSocket from "ws";

export class RithmicBrokerAdapter implements IBrokerAdapter {
  readonly name = "rithmic" as const;

  private ws: WebSocket | null = null;

  async connect(): Promise<void> {
    const cfg = getRithmicConfig();

    console.log("[rithmic-adapter] connect", {
      system: cfg.system,
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
    });

    // Rithmic R|Protocol uses WebSockets (not raw TCP)
    const url = `wss://${cfg.host}:${cfg.port}`;

    this.ws = createRithmicWs(url);
  }

  async authorize(): Promise<void> {
    // Rithmic protobuf logon will be sent over this.ws
    console.log("[rithmic-adapter] authorize (stub)");
  }

  startKeepAlive(): void {
    // Will be implemented once Rithmic heartbeat rules are defined
  }

  stopKeepAlive(): void {
    // Will be implemented with WS lifecycle
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
