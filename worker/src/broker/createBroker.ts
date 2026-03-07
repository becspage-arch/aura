// worker/src/broker/createBroker.ts

import type { IBrokerAdapter, BrokerName } from "./IBrokerAdapter.js";
import { CqgBrokerAdapter } from "./CqgBrokerAdapter.js";
import { RithmicBrokerAdapter } from "./RithmicBrokerAdapter.js";
import { ProjectXBrokerAdapter } from "./projectx/ProjectXBrokerAdapter.js";
import { DemoBrokerAdapter } from "./aurademo/DemoBrokerAdapter.js";

class DisabledBroker implements IBrokerAdapter {
  public readonly name: BrokerName = "mock";

  async connect() {
    console.log("[broker] disabled");
  }

  async authorize() {}

  startKeepAlive() {}

  stopKeepAlive() {}

  async disconnect() {}
}

export function createBroker(brokerName: string): IBrokerAdapter {
  const broker = (brokerName || "disabled").toLowerCase();

  if (broker === "cqg") {
    return new CqgBrokerAdapter();
  }

  if (broker === "rithmic") {
    return new RithmicBrokerAdapter();
  }

  if (broker === "projectx") {
    return new ProjectXBrokerAdapter();
  }

  if (broker === "aura_demo") {
    return new DemoBrokerAdapter();
  }

  return new DisabledBroker();
}
