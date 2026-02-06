// worker/src/trading/buildBracket.ts

import type { TradeIntent } from "../strategy/coreplus315Engine.js";

export type BracketOrder = {
  symbol: string;
  side: "buy" | "sell";
  qty: number;

  // Tick distances - required for tick-based validation + broker execution logic
  stopLossTicks: number;
  takeProfitTicks: number;

  entry: {
    type: "market";
    price: number; // informational only for market orders
  };

  stopLoss: {
    type: "stop";
    price: number;
  };

  takeProfit: {
    type: "limit";
    price: number;
  };

  meta: {
    strategy: TradeIntent["strategy"];
    entryTime: number;
    fvgTime: number;
    stopTicks: number;
    tpTicks: number;
    rr: number;
    riskUsdPlanned: number;
  };
};

export function buildBracketFromIntent(intent: TradeIntent): BracketOrder {
  return {
    symbol: intent.symbol,
    side: intent.side,
    qty: intent.contracts,

    stopLossTicks: intent.stopTicks,
    takeProfitTicks: intent.tpTicks,

    entry: {
      type: "market",
      price: intent.entryPrice,
    },

    stopLoss: {
      type: "stop",
      price: intent.stopPrice,
    },

    takeProfit: {
      type: "limit",
      price: intent.takeProfitPrice,
    },

    meta: {
      strategy: intent.strategy,
      entryTime: intent.entryTime,
      fvgTime: intent.fvgTime,
      stopTicks: intent.stopTicks,
      tpTicks: intent.tpTicks,
      rr: intent.rr,
      riskUsdPlanned: intent.riskUsdPlanned,
    },
  };
}
