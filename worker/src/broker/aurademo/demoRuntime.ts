// worker/src/broker/aurademo/demoRuntime.ts

type Side = "buy" | "sell";

export type DemoOpenPosition = {
  entryOrderId: string;
  stopOrderId: string | null;
  takeProfitOrderId: string | null;

  contractId: string;
  symbol: string | null;

  side: Side;
  qty: number;

  entryPrice: number;
  stopPrice: number | null;
  takeProfitPrice: number | null;

  openedAtIso: string;
};

type Closed15sCandle = {
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

class DemoRuntime {
  private latestPriceByContract = new Map<string, number>();
  private openPositionsByEntryOrderId = new Map<string, DemoOpenPosition>();

  setLatestPrice(contractId: string, price: number) {
    if (!contractId) return;
    if (!Number.isFinite(price)) return;
    this.latestPriceByContract.set(contractId, price);
  }

  getLatestPrice(contractId: string): number | null {
    const v = this.latestPriceByContract.get(contractId);
    return Number.isFinite(v as number) ? (v as number) : null;
  }

  addOpenPosition(pos: DemoOpenPosition) {
    this.openPositionsByEntryOrderId.set(pos.entryOrderId, pos);
  }

  removeOpenPosition(entryOrderId: string) {
    this.openPositionsByEntryOrderId.delete(entryOrderId);
  }

  getOpenPosition(entryOrderId: string): DemoOpenPosition | null {
    return this.openPositionsByEntryOrderId.get(entryOrderId) ?? null;
  }

  getOpenPositionsForContract(contractId: string): DemoOpenPosition[] {
    return Array.from(this.openPositionsByEntryOrderId.values()).filter(
      (p) => p.contractId === contractId
    );
  }

  evaluateClosed15s(candle: Closed15sCandle): Array<{
    entryOrderId: string;
    exitOrderId: string;
    exitReason: "STOP_LOSS" | "TAKE_PROFIT";
    exitPrice: number;
  }> {
    const hits: Array<{
      entryOrderId: string;
      exitOrderId: string;
      exitReason: "STOP_LOSS" | "TAKE_PROFIT";
      exitPrice: number;
    }> = [];

    for (const pos of this.getOpenPositionsForContract(candle.symbol)) {
      if (pos.side === "buy") {
        if (
          pos.stopPrice != null &&
          Number.isFinite(pos.stopPrice) &&
          candle.low <= pos.stopPrice
        ) {
          hits.push({
            entryOrderId: pos.entryOrderId,
            exitOrderId: pos.stopOrderId ?? `demo-sl-${Date.now()}`,
            exitReason: "STOP_LOSS",
            exitPrice: pos.stopPrice,
          });
          continue;
        }

        if (
          pos.takeProfitPrice != null &&
          Number.isFinite(pos.takeProfitPrice) &&
          candle.high >= pos.takeProfitPrice
        ) {
          hits.push({
            entryOrderId: pos.entryOrderId,
            exitOrderId: pos.takeProfitOrderId ?? `demo-tp-${Date.now()}`,
            exitReason: "TAKE_PROFIT",
            exitPrice: pos.takeProfitPrice,
          });
          continue;
        }
      } else {
        if (
          pos.stopPrice != null &&
          Number.isFinite(pos.stopPrice) &&
          candle.high >= pos.stopPrice
        ) {
          hits.push({
            entryOrderId: pos.entryOrderId,
            exitOrderId: pos.stopOrderId ?? `demo-sl-${Date.now()}`,
            exitReason: "STOP_LOSS",
            exitPrice: pos.stopPrice,
          });
          continue;
        }

        if (
          pos.takeProfitPrice != null &&
          Number.isFinite(pos.takeProfitPrice) &&
          candle.low <= pos.takeProfitPrice
        ) {
          hits.push({
            entryOrderId: pos.entryOrderId,
            exitOrderId: pos.takeProfitOrderId ?? `demo-tp-${Date.now()}`,
            exitReason: "TAKE_PROFIT",
            exitPrice: pos.takeProfitPrice,
          });
          continue;
        }
      }
    }

    for (const hit of hits) {
      this.removeOpenPosition(hit.entryOrderId);
    }

    return hits;
  }
}

export const demoRuntime = new DemoRuntime();