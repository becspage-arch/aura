import type { IBrokerAdapter, BrokerName } from "./IBrokerAdapter.js";
import { CqgBrokerAdapter } from "./CqgBrokerAdapter.js";

class DisabledBroker implements IBrokerAdapter {
  public readonly name: BrokerName = "mock";

  async connect() {
    console.log("[broker] disabled");
  }

  async authorize() {
    // no-op
  }

  startKeepAlive() {
    // no-op
  }

  stopKeepAlive() {
    // no-op
  }

  async disconnect() {
    // no-op
  }
}

export function createBroker(): IBrokerAdapter {
  const broker = (process.env.BROKER || "disabled").toLowerCase();

  if (broker === "cqg") {
    return new CqgBrokerAdapter();
  }

  if (broker === "rithmic") {
    throw new Error("Rithmic adapter not wired yet");
  }

  return new DisabledBroker();
}
