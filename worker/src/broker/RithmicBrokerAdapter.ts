import type { IBrokerAdapter } from "./IBrokerAdapter.js";
import { getRithmicConfig } from "./rithmicConfig.js";
import { createRithmicSocket } from "./rithmicSocket.js";

export class RithmicBrokerAdapter implements IBrokerAdapter {
  readonly name = "rithmic" as const;

  async connect(): Promise<void> {
    const cfg = getRithmicConfig();

    console.log("[rithmic-adapter] connect", {
      system: cfg.system,
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
    });

    // Open TCP socket (no protocol yet)
    createRithmicSocket(cfg.host, cfg.port);
  }

  async authorize(): Promise<void> {
    // Rithmic logon will be implemented AFTER socket connection exists.
    // For now, keep this as a stub so the broker lifecycle stays consistent.
    console.log("[rithmic-adapter] authorize (stub)");
  }

  startKeepAlive(): void {
    // Will be implemented once the Rithmic heartbeat rules are wired
  }

  stopKeepAlive(): void {
    // Will be implemented with socket lifecycle
  }

  async disconnect(): Promise<void> {
    // Will close socket cleanly later
  }
}
