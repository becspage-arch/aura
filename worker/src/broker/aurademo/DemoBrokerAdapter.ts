// worker/src/broker/aurademo/DemoBrokerAdapter.ts
import type {
  IBrokerAdapter,
  PlaceBracketOrderPlan,
  PlaceBracketOrderResult,
} from "../IBrokerAdapter.js";

import type { BrokerCapabilities } from "../BrokerCapabilities.js";
import { demoRuntime } from "./demoRuntime.js";

const caps: BrokerCapabilities = {
  supportsBracketInSingleCall: false,
  supportsAttachBracketsAfterEntry: false,
  requiresSignedBracketTicks: false,
};

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export class DemoBrokerAdapter implements IBrokerAdapter {
  readonly name = "aura_demo" as const;
  readonly capabilities = caps;

  async connect(): Promise<void> {
    console.log("[demo-broker] connect");
  }

  async authorize(): Promise<void> {
    console.log("[demo-broker] authorize");
  }

  async disconnect(): Promise<void> {
    console.log("[demo-broker] disconnect");
  }

  startKeepAlive(): void {}
  stopKeepAlive(): void {}

  getStatus() {
    return {
      broker: "aura_demo",
      mode: "paper",
    };
  }

  async placeBracketOrder(
    plan: PlaceBracketOrderPlan
  ): Promise<PlaceBracketOrderResult> {
    const {
      contractId,
      symbol,
      side,
      size,
      stopPrice,
      takeProfitPrice,
      stopLossTicks,
      takeProfitTicks,
    } = plan;

    const latestPrice = demoRuntime.getLatestPrice(contractId);

    if (!latestPrice) {
      throw new Error(
        `[demo-broker] cannot fill entry — no price yet for ${contractId}`
      );
    }

    const entryOrderId = id("demo-entry");
    const stopOrderId = stopPrice || stopLossTicks ? id("demo-sl") : null;
    const takeProfitOrderId =
      takeProfitPrice || takeProfitTicks ? id("demo-tp") : null;

    let finalStop = stopPrice ?? null;
    let finalTP = takeProfitPrice ?? null;

    if (finalStop == null && stopLossTicks != null) {
      finalStop =
        side === "buy"
          ? latestPrice - stopLossTicks
          : latestPrice + stopLossTicks;
    }

    if (finalTP == null && takeProfitTicks != null) {
      finalTP =
        side === "buy"
          ? latestPrice + takeProfitTicks
          : latestPrice - takeProfitTicks;
    }

    demoRuntime.addOpenPosition({
      entryOrderId,
      stopOrderId,
      takeProfitOrderId,
      contractId,
      symbol: symbol ?? null,
      side,
      qty: size,
      entryPrice: latestPrice,
      stopPrice: finalStop,
      takeProfitPrice: finalTP,
      openedAtIso: new Date().toISOString(),
    });

    console.log("[demo-broker] ENTRY_FILLED", {
      entryOrderId,
      contractId,
      side,
      size,
      entryPrice: latestPrice,
      stopPrice: finalStop,
      takeProfitPrice: finalTP,
    });

    return {
      entryOrderId,
      stopOrderId,
      takeProfitOrderId,
      raw: {
        entryPrice: latestPrice,
        stopPrice: finalStop,
        takeProfitPrice: finalTP,
      },
    };
  }
}